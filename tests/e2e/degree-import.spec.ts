import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Exercises the Degree page end to end: switch to the tab, import a (sanitized)
 * Academic Progress export, see it render, and confirm it survives a reload
 * (rehydrated from localStorage by DegreeImportService.load()).
 *
 * Placement is manual, so the assignment tests assert both that nothing lands
 * in a bucket on its own and that a placement survives a reload.
 */

const fixture = fileURLToPath(
  new URL('../fixtures/academic-progress-sample.xlsx', import.meta.url),
);

test.beforeEach(async ({ page }) => {
  // Skip the first-visit welcome tutorial so it doesn't overlay the flow.
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
});

test('imports an Academic Progress file and persists it across reload', async ({
  page,
}) => {
  await page.goto('/');

  await page.click('#degree-tab');
  await expect(page.locator('.degree-dropzone')).toBeVisible();

  await page.setInputFiles('#degree-import-file', fixture);

  // Summary + requirement cards render from the parsed record.
  await expect(page.locator('.degree-summary-title')).toContainText(
    'Computer Science',
  );
  await expect(page.locator('.requirement-card').first()).toBeVisible();

  // Persisted: after a reload the record rehydrates without re-importing.
  await page.reload();
  await page.click('#degree-tab');
  await expect(page.locator('.degree-summary-title')).toContainText(
    'Computer Science',
  );
  await expect(page.locator('.degree-dropzone')).toHaveCount(0);
});

test('hides umbrella (degree-wide) requirements until toggled', async ({
  page,
}) => {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();

  // "Total Credits" / "Residency" are hidden by default.
  await expect(
    page.locator('.requirement-card-name', { hasText: 'Total Credits' }),
  ).toHaveCount(0);

  // The toggle reveals them.
  await page.locator('.degree-umbrella-toggle').click();
  await expect(
    page.locator('.requirement-card-name', { hasText: 'Total Credits' }),
  ).toBeVisible();
});

test('status filters are multi-select and collapse to All when all chosen', async ({
  page,
}) => {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();

  const cards = page.locator('.requirement-card');
  // Anchor the match: plain-string hasText is case-insensitive, so "Satisfied"
  // would otherwise also match "Not satisfied".
  const chip = (name: string) =>
    page.locator('.degree-filter-chip', { hasText: new RegExp('^' + name) });

  await expect(cards).toHaveCount(3); // All selected by default

  await chip('Not satisfied').click();
  await expect(cards).toHaveCount(1);

  await chip('In progress').click(); // multi-select: both statuses shown
  await expect(cards).toHaveCount(2);

  await chip('Satisfied').click(); // all three -> collapse to All
  await expect(chip('All')).toHaveAttribute('aria-pressed', 'true');
  await expect(cards).toHaveCount(3);
});

/**
 * Import the fixture and put a catalog course into the active schedule, chosen
 * to be absent from the transcript - courses Workday applied stay out of the rail.
 */
async function setupWithScheduleCourse(page: Page): Promise<void> {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();

  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate(async () => {
    const services = (window as any).services;
    const cs = services.courseDataService
      .getAllDepartments()
      .find((d: any) => d.abbreviation === 'CS');
    const course = cs.courses.find((c: any) => c.number === '1004');
    await services.courseSelectionService.selectCourse(course);
  });
  await expect(railCount(page)).toHaveText('1');
}

const railCount = (page: Page) => page.locator('.degree-rail-count');
/** Scoped to the bucket list - rail tiles carry the same classes. */
const placedCodes = (page: Page) =>
  page.locator(
    '.degree-card-list .requirement-course.is-schedule .requirement-course-code',
  );

test('leaves schedule courses unassigned until the user places them', async ({
  page,
}) => {
  await setupWithScheduleCourse(page);

  // CS 1004 is a CS course and Core Requirement an unsatisfied CS bucket, which
  // is exactly the shape a heuristic would place for you. Nothing should.
  await expect(
    page.locator('.degree-rail-list .requirement-course-code'),
  ).toHaveText(['CS 1004']);
  await expect(placedCodes(page)).toHaveCount(0);
});

test('assigns a course to a bucket and keeps it across a reload', async ({
  page,
}) => {
  await setupWithScheduleCourse(page);

  await page.locator('.degree-rail-list .assign-menu-trigger').first().click();
  await page
    .locator('.assign-menu-item', { hasText: /^Core Requirement$/ })
    .click();

  await expect(placedCodes(page)).toHaveText(['CS 1004']);
  await expect(railCount(page)).toHaveText('0');

  await page.reload();
  await page.click('#degree-tab');
  await page.locator('.degree-summary-title').waitFor();
  await expect(placedCodes(page)).toHaveText(['CS 1004']);
  await expect(railCount(page)).toHaveText('0');
});

test('sends an assigned course back to the rail', async ({ page }) => {
  await setupWithScheduleCourse(page);

  await page.locator('.degree-rail-list .assign-menu-trigger').first().click();
  await page
    .locator('.assign-menu-item', { hasText: /^Core Requirement$/ })
    .click();
  await expect(placedCodes(page)).toHaveCount(1);

  await page
    .locator('.degree-card-list .requirement-course-remove')
    .first()
    .click();
  await expect(placedCodes(page)).toHaveCount(0);
  await expect(railCount(page)).toHaveText('1');
});

test('drags a course from the rail onto a bucket and back again', async ({
  page,
}) => {
  await setupWithScheduleCourse(page);

  const card = page.locator('[data-bucket-id*="Core Requirement"]');
  await card.scrollIntoViewIfNeeded();

  // Press the title, not the code/Assign buttons - a press on a control is
  // deliberately passed through to it.
  const grip = page
    .locator('.degree-rail-list .requirement-course-title')
    .first();

  // Rail -> bucket: the tile itself moves (position:fixed) with a placeholder
  // holding its slot.
  let box = (await grip.boundingBox())!;
  const cardBox = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + 40, { steps: 8 });
  await expect(page.locator('.requirement-course.is-dragging')).toHaveCSS(
    'position',
    'fixed',
  );
  await expect(page.locator('.course-drag-placeholder')).toHaveCount(1);
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + 40, {
    steps: 12,
  });
  await expect(card).toHaveClass(/drag-over/);
  await page.mouse.up();

  await expect(placedCodes(page)).toHaveText(['CS 1004']);
  await expect(railCount(page)).toHaveText('0');
  await expect(page.locator('.course-drag-placeholder')).toHaveCount(0);

  // Bucket -> rail unassigns it again.
  box = (await page
    .locator(
      '.degree-card-list .requirement-course.is-schedule .requirement-course-title',
    )
    .first()
    .boundingBox())!;
  const rail = (await page.locator('.degree-rail').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 40, { steps: 8 });
  await page.mouse.move(rail.x + rail.width / 2, rail.y + 200, { steps: 12 });
  await page.mouse.up();

  await expect(placedCodes(page)).toHaveCount(0);
  await expect(railCount(page)).toHaveText('1');
});

test('opens a rail slot for an incoming course and settles without a bounce', async ({
  page,
}) => {
  await setupWithScheduleCourse(page);
  // A second course stays behind in the rail, so the gap opens above a real
  // neighbour - which is also where the rail measures the gap's height from.
  await page.evaluate(async () => {
    const services = (window as any).services;
    const cs = services.courseDataService
      .getAllDepartments()
      .find((d: any) => d.abbreviation === 'CS');
    await services.courseSelectionService.selectCourse(
      cs.courses.find((c: any) => c.number === '2102'),
    );
  });
  await expect(railCount(page)).toHaveText('2');

  await page.locator('.degree-rail-list .assign-menu-trigger').first().click();
  await page
    .locator('.assign-menu-item', { hasText: /^Core Requirement$/ })
    .click();
  await expect(railCount(page)).toHaveText('1');

  const placed = page
    .locator(
      '.degree-card-list .requirement-course.is-schedule .requirement-course-title',
    )
    .first();
  await placed.scrollIntoViewIfNeeded();
  const box = (await placed.boundingBox())!;
  const rail = (await page.locator('.degree-rail').boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 30, { steps: 5 });

  // Hovering the rail opens a full-height gap for the tile before it lands.
  await page.mouse.move(rail.x + rail.width / 2, rail.y + 300, { steps: 12 });
  const slot = page.locator('.degree-rail-slot');
  await expect(slot).toHaveCount(1);
  // Let the gap finish opening, or the "nothing moved" sample below starts
  // mid-animation and catches the tail of the intro instead.
  await page.waitForFunction(() => {
    const el = document.querySelector('.degree-rail-slot');
    return !!el && el.getAnimations().length === 0;
  });
  await expect
    .poll(async () => (await slot.boundingBox())!.height)
    .toBeGreaterThan(40);

  // Releasing swaps the real tile in where the gap already was. The old
  // slide/fade on the tiles replayed here, after the drop had moved on; nothing
  // in the rail may shift now.
  const moved = page.evaluate(() => {
    const boxes = () =>
      [...document.querySelectorAll('.degree-rail-list > *')].map(e => {
        const r = e.getBoundingClientRect();
        return `${Math.round(r.top)}/${Math.round(r.height)}`;
      });
    const first = boxes();
    const start = performance.now();
    return new Promise<boolean>(resolve => {
      const tick = () => {
        const now = boxes();
        if (now.length !== first.length || now.some((b, i) => b !== first[i]))
          return resolve(true);
        if (performance.now() - start < 400) requestAnimationFrame(tick);
        else resolve(false);
      };
      requestAnimationFrame(tick);
    });
  });
  await page.mouse.up();
  expect(await moved).toBe(false);

  await expect(railCount(page)).toHaveText('2');
  await expect(slot).toHaveCount(0);
});

/**
 * The grid's whole payoff rests on cards being bounded and uniform: a CSS grid
 * row is as tall as its tallest card, so one card that grows with its contents
 * wastes a full row's height beside its neighbours. Guard both halves of that -
 * the uniform height, and the overflow control that makes it possible.
 */
test('keeps every collapsed bucket card the same height', async ({ page }) => {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();
  // Show every bucket, umbrella ones included - they carry the most courses and
  // are the likeliest to outgrow the budget.
  await page.locator('.degree-umbrella-toggle').click();

  const heights = await page.evaluate(() => [
    ...new Set(
      [...document.querySelectorAll('.requirement-card')].map(el =>
        Math.round(el.getBoundingClientRect().height),
      ),
    ),
  ]);
  expect(heights).toHaveLength(1);
});

test('hides overflow behind "+N more" and expands the card in place', async ({
  page,
}) => {
  await setupWithScheduleCourse(page);

  // Total Credits carries the whole transcript, so it always overflows.
  await page.locator('.degree-umbrella-toggle').click();
  const card = page.locator('[data-bucket-id*="Total Credits"]');
  const toggle = card.locator('.requirement-card-toggle');
  await expect(toggle).toHaveText(/^\+\d+ more$/);

  const collapsed = card.locator('.requirement-course');
  const collapsedCount = await collapsed.count();

  await toggle.click();
  await expect(card.locator('.requirement-card-less')).toBeVisible();
  expect(await collapsed.count()).toBeGreaterThan(collapsedCount);

  await card.locator('.requirement-card-less').click();
  await expect(collapsed).toHaveCount(collapsedCount);
});

/**
 * A satisfied bucket collapses its transcript history to a "N courses ·
 * complete" toggle - but never the user's own placement. An early cut of that
 * rule swallowed the tile the moment it was dropped, so the drop looked like it
 * had failed.
 */
test('keeps a placed course visible in an already-satisfied bucket', async ({
  page,
}) => {
  await setupWithScheduleCourse(page);

  await page.locator('.degree-rail-list .assign-menu-trigger').first().click();
  await page
    .locator('.assign-menu-item', { hasText: /^Systems Requirement$/ })
    .click();

  const card = page.locator('[data-bucket-id*="Systems Requirement"]');
  await expect(card).toHaveClass(/req-satisfied/);
  await expect(
    card.locator('.requirement-course.is-schedule .requirement-course-code'),
  ).toHaveText(['CS 1004']);
});

/**
 * The course finder answers "where did this course end up?" - the one question
 * the bucket list itself cannot, since a course can count toward more than one
 * requirement and an unplaced one appears in no card at all.
 */
test('finds a course and names the bucket it is in', async ({ page }) => {
  await setupWithScheduleCourse(page);

  await page.locator('#degree-course-search').click();
  const finder = page.locator('.course-finder-modal');
  await expect(finder).toBeVisible();

  // Unplaced to begin with, and the finder says so.
  const row = finder.locator('.course-finder-row', { hasText: 'CS 1004' });
  await expect(row.locator('.course-finder-bucket-name')).toHaveText(
    'Not in a bucket',
  );

  await row.locator('.assign-menu-trigger').click();
  await page
    .locator('.assign-menu-item', { hasText: /^Core Requirement$/ })
    .click();
  await expect(row.locator('.course-finder-bucket-name')).toHaveText(
    'Core Requirement',
  );

  // Search narrows to the one course, by code.
  await page.locator('#course-finder-search').fill('CS 1004');
  await expect(finder.locator('.course-finder-row')).toHaveCount(1);

  // ...and by the name of the bucket holding it.
  await page.locator('#course-finder-search').fill('core requirement');
  await expect(
    finder.locator('.course-finder-row', { hasText: 'CS 1004' }),
  ).toBeVisible();

  await page.locator('#course-finder-search').fill('nothing matches this');
  await expect(finder.locator('.course-finder-row')).toHaveCount(0);
  await expect(finder.locator('.empty-state')).toBeVisible();

  // Escape closes it, handing the width back to the bucket grid.
  await page.keyboard.press('Escape');
  await expect(finder).toHaveCount(0);
});

/**
 * A bucket chip that only NAMES the requirement leaves the reader to go and find
 * the card themselves. Clicking one closes the finder, scrolls the bucket into
 * view and flashes it - and flashes every other bucket the course counts toward,
 * since "it is in two places" is the finder's whole reason to exist.
 */
test('jumps from a finder bucket row to the bucket card', async ({ page }) => {
  await setupWithScheduleCourse(page);

  await page.locator('.degree-rail-list .assign-menu-trigger').first().click();
  await page
    .locator('.assign-menu-item', { hasText: /^Core Requirement$/ })
    .click();

  await page.locator('#degree-course-search').click();
  const row = page.locator('.course-finder-row', { hasText: 'CS 1004' });
  const bucketRow = row.locator('button.course-finder-bucket');
  await expect(bucketRow.locator('.course-finder-bucket-name')).toHaveText(
    'Core Requirement',
  );

  await bucketRow.click();

  // The flash is a WAAPI animation tagged with its own id, so the assertion can
  // name the thing under test rather than sampling a colour mid-fade.
  const card = page.locator('[data-bucket-id*="Core Requirement"]');
  await expect
    .poll(() =>
      card.evaluate(el =>
        el.getAnimations().some(a => a.id === 'bucket-focus'),
      ),
    )
    .toBe(true);

  await expect(page.locator('.course-finder-modal')).toHaveCount(0);
  await expect(card).toBeInViewport();
});

/**
 * The jump has to be able to LAND. Degree-wide aggregates are hidden behind the
 * umbrella toggle, so jumping to one has to drop what is hiding it first -
 * otherwise the modal closes onto a page that never scrolls anywhere.
 */
test('reveals a hidden degree-wide bucket when jumping to it', async ({
  page,
}) => {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();

  const totalCredits = page.locator('.requirement-card-name', {
    hasText: 'Total Credits',
  });
  await expect(totalCredits).toHaveCount(0);

  await page.locator('#degree-course-search').click();
  // By-bucket mode: the heading is the bucket, so it carries the jump.
  await page.locator('#course-finder-sort').click();
  await expect(page.locator('.course-finder-sort-label')).toHaveText(
    'By bucket',
  );
  await page
    .locator('.course-finder-group', { hasText: 'Total Credits' })
    .first()
    .locator('.course-finder-group-jump')
    .click();

  await expect(page.locator('.course-finder-modal')).toHaveCount(0);
  await expect(page.locator('.degree-umbrella-toggle')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(totalCredits).toBeVisible();
});

/**
 * The other half of a finder card is the catalog. A degree course can be years
 * older than the active schedule, so the search leaves from a clean slate -
 * every filter dropped and the year set to All - rather than inheriting the
 * planner's current view, which is exactly what would find nothing.
 */
test('sends a finder course to the classes page on a cleared search', async ({
  page,
}) => {
  await setupWithScheduleCourse(page);

  // A department filter to prove the reset: it would hide CS 1004 outright.
  await page.evaluate(() => {
    (window as any).services.filterService.addFilter('department', {
      departments: ['MA'],
    });
  });

  await page.locator('#degree-course-search').click();
  await page
    .locator('.course-finder-row', { hasText: 'CS 1004' })
    .locator('.course-finder-open')
    .click();

  await expect(page.locator('#planner-page')).toBeVisible();
  await expect(page.locator('#search-input')).toHaveValue('CS1004');

  const filters = await page.evaluate(() =>
    (window as any).services.filterService
      .getActiveFilters()
      .map((f: any) => [f.id, f.criteria]),
  );
  expect(Object.fromEntries(filters)).toEqual({
    academicYear: { year: 'all' },
    searchText: { query: 'CS1004' },
  });
});

test('cycles the finder through its grouping modes', async ({ page }) => {
  await setupWithScheduleCourse(page);
  await page.locator('#degree-course-search').click();

  const label = page.locator('.course-finder-sort-label');
  const sortButton = page.locator('#course-finder-sort');
  const headings = page.locator('.course-finder-group-head');

  await expect(label).toHaveText('By source');
  await expect(headings.first()).toContainText('In your schedule');

  await sortButton.click();
  await expect(label).toHaveText('By bucket');
  // Degree-wide aggregates sort after the named requirements.
  await expect(headings.first()).not.toContainText('Total Credits');

  await sortButton.click();
  await expect(label).toHaveText('By code');
  await expect(headings).toHaveCount(1);

  await sortButton.click();
  await expect(label).toHaveText('By term');

  await sortButton.click(); // wraps
  await expect(label).toHaveText('By source');
});

test('swaps between the grid and full bucket layouts, and remembers', async ({
  page,
}) => {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();

  const list = page.locator('.degree-card-list');
  await expect(list).not.toHaveClass(/is-full/);
  // Grid bounds each card, so the satisfied bucket keeps its course behind a
  // toggle. Anchored on that bucket rather than "some card somewhere": an
  // unanchored .first() would burn the whole timeout to say nothing useful.
  const systems = page.locator('[data-bucket-id*="Systems Requirement"]');
  await expect(systems.locator('.requirement-card-toggle')).toHaveText(
    /complete$/,
  );

  await page.locator('#degree-view-full').click();
  await expect(list).toHaveClass(/is-full/);
  // Full shows everything, so there is nothing left to expand.
  await expect(page.locator('.requirement-card-toggle')).toHaveCount(0);

  await page.reload();
  await page.click('#degree-tab');
  await page.locator('.degree-summary-title').waitFor();
  await expect(page.locator('.degree-card-list')).toHaveClass(/is-full/);

  await page.locator('#degree-view-grid').click();
  await expect(page.locator('.degree-card-list')).not.toHaveClass(/is-full/);
});

/**
 * The rail is a SidePanel, like the sidebars on the other pages. The shell must
 * not be the scrolling element: ResizeHandle is positioned against it and
 * measures it, so a scrolling panel would carry its own handle out of view and
 * report the wrong width.
 */
test('resizes the unassigned rail and remembers the width', async ({
  page,
}) => {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();

  const shape = await page.evaluate(() => {
    const rail = document.querySelector('.degree-rail')!;
    return {
      isPanel: rail.classList.contains('side-panel'),
      overflowY: getComputedStyle(rail).overflowY,
      position: getComputedStyle(rail).position,
      handles: rail.querySelectorAll('.resize-handle').length,
      // the scroller is a child, and is the element dragAutoScroll looks for
      innerScrollers: rail.querySelectorAll('.degree-pane').length,
    };
  });
  expect(shape).toEqual({
    isPanel: true,
    overflowY: 'hidden',
    position: 'relative',
    handles: 1,
    innerScrollers: 1,
  });

  // Drag the seam right; the handle straddles the border, so aim just inside it.
  const widthOf = (selector: string) =>
    page.evaluate(
      sel =>
        Math.round(document.querySelector(sel)!.getBoundingClientRect().width),
      selector,
    );
  const before = await widthOf('.degree-rail');
  await page.mouse.move(before - 3, 300);
  await page.mouse.down();
  await page.mouse.move(before + 77, 300, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => widthOf('.degree-rail')).toBe(before + 80);

  // Restored before first paint on the next load.
  await page.reload();
  await page.click('#degree-tab');
  await page.locator('.degree-summary-title').waitFor();
  expect(await widthOf('.degree-rail')).toBe(before + 80);
});

test('reorders config rows vertically, clamped to the list', async ({
  page,
}) => {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();
  await page.locator('#degree-configure-buckets-btn').click();

  const names = () => page.locator('.bucket-config-name').allTextContents();
  const before = await names();

  const last = page.locator('.bucket-config-row').last();
  const handle = (await last.locator('.bucket-config-handle').boundingBox())!;
  const list = (await page.locator('.bucket-config-list').boundingBox())!;

  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y - 40, {
    steps: 5,
  });

  // Shove the pointer far off to the side and above the list: the row must
  // neither move horizontally nor escape its container.
  await page.mouse.move(handle.x + 600, list.y - 400, { steps: 10 });
  const clamped = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>(
      '.bucket-config-row.is-dragging',
    )!;
    const listEl = document.querySelector<HTMLElement>('.bucket-config-list')!;
    const r = row.getBoundingClientRect();
    const l = listEl.getBoundingClientRect();
    return {
      translateX: new DOMMatrix(getComputedStyle(row).transform).m41,
      insideList: r.top >= Math.floor(l.top) && r.bottom <= Math.ceil(l.bottom),
    };
  });
  expect(clamped.translateX).toBe(0);
  expect(clamped.insideList).toBe(true);
  // The rows it displaces slide aside to open the gap it drops into.
  const shifted = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.bucket-config-row')]
      .filter(r => !r.classList.contains('is-dragging'))
      .map(r => Math.round(new DOMMatrix(getComputedStyle(r).transform).m42)),
  );
  expect(shifted.filter(y => y !== 0).length).toBeGreaterThan(0);

  // Release inside the window - Playwright cannot deliver a pointerup outside
  // the viewport, and it is the realistic gesture anyway.
  await page.mouse.move(list.x + list.width / 2, list.y + 4, { steps: 6 });
  await page.mouse.up();

  // The last bucket is now first, and the order is persisted.
  await expect
    .poll(async () => (await names())[0])
    .toBe(before[before.length - 1]);
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('wpi-planner-degree-buckets')!).order,
  );
  expect(stored).toHaveLength(before.length);
});

test('adds and deletes buckets from the config modal', async ({ page }) => {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();

  await page.locator('#degree-configure-buckets-btn').click();
  const rows = page.locator('.bucket-config-row');
  await expect(rows).toHaveCount(5);

  // Add a custom bucket.
  await page.locator('#bucket-config-add-btn').click();
  await page.locator('#new-bucket-name').fill('Robotics minor');
  await page.locator('#bucket-config-save-btn').click();
  await expect(rows).toHaveCount(6);
  await expect(
    page.locator('.bucket-config-row[data-bucket-id="custom:1"]'),
  ).toBeVisible();

  // Delete an imported bucket through the shared confirm dialog.
  const systems = rows.filter({ hasText: 'Systems Requirement' });
  await systems.locator('.bucket-config-action.is-danger').click();
  await page.locator('#confirm-primary-btn').click();
  await expect(rows).toHaveCount(5);
  await expect(rows.filter({ hasText: 'Systems Requirement' })).toHaveCount(0);

  // Both edits survive a reload, and the deleted bucket stays off the page.
  await page.reload();
  await page.click('#degree-tab');
  await page.locator('.degree-summary-title').waitFor();
  await expect(
    page.locator('.requirement-card-name', { hasText: 'Robotics minor' }),
  ).toBeVisible();
  await expect(
    page.locator('.requirement-card-name', { hasText: 'Systems Requirement' }),
  ).toHaveCount(0);
});

test('renames an imported bucket without touching the record', async ({
  page,
}) => {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();

  await page.locator('#degree-configure-buckets-btn').click();
  // Anchor on the bucket id: in edit mode the row swaps its name for inputs, so
  // a hasText filter would stop matching mid-test.
  const core = page.locator(
    '.bucket-config-row[data-bucket-id*="Core Requirement"]',
  );
  await core.locator('.bucket-config-action', { hasText: 'Edit' }).click();
  await core.locator('input[type="text"]').fill('Major core');
  await core.locator('.modal-btn.btn-primary').click();

  await expect(
    page.locator('.bucket-config-row').filter({ hasText: 'Major core' }),
  ).toBeVisible();

  // The rename is an override layer - the imported record keeps Workday's name.
  const recordName = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('wpi-planner-degree-record')!);
    return raw.requirements.some((r: any) => r.name === 'Core Requirement');
  });
  expect(recordName).toBe(true);
});

test('browses the catalog from an empty bucket slot', async ({ page }) => {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();

  // Clicking an empty slot filters the courses page and navigates there.
  await page.locator('.requirement-course-empty').first().click();
  await expect(page.locator('#planner-page')).toBeVisible();
});

test('clicking a course name opens its catalog entry on the classes page', async ({
  page,
}) => {
  page.on('dialog', d => d.dismiss()); // don't hang if a code can't be resolved

  await setupWithScheduleCourse(page);

  // The rail tile links to a real catalog course.
  await page
    .locator('.degree-rail-list .requirement-course-link')
    .first()
    .click();
  await expect(page.locator('#planner-page')).toBeVisible();
  await expect(
    page.locator('#course-container [data-course-id].active'),
  ).toBeVisible();
});

test('keeps all pages mounted when switching to Degree', async ({ page }) => {
  await page.goto('/');
  await page.click('#degree-tab');
  // The planner and schedule regions remain in the DOM (display toggled, not torn down).
  await expect(page.locator('#planner-page')).toHaveCount(1);
  await expect(page.locator('#schedule-page')).toHaveCount(1);
  await expect(page.locator('#degree-page')).toBeVisible();
});
