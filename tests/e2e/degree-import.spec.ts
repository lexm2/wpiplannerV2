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

  await chip('Satisfied').click(); // all three → collapse to All
  await expect(chip('All')).toHaveAttribute('aria-pressed', 'true');
  await expect(cards).toHaveCount(3);
});

test('builds a schedule from the planned courses and swaps to it', async ({
  page,
}) => {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();

  // The fixture has one planned (in-progress) course → the build button appears.
  const buildBtn = page.locator('.degree-build-btn');
  await expect(buildBtn).toContainText('planned');
  await buildBtn.click();

  // Swaps to a new active "Enrolled" schedule and lands on the schedule page.
  await expect(page.locator('#schedule-picker-label')).toHaveText('Enrolled');
  await expect(page.locator('#schedule-page')).toBeVisible();
  // The planned course was added to the schedule (shown in the schedule sidebar).
  await expect(page.locator('#schedule-sidebar-content')).toContainText('2022');
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
