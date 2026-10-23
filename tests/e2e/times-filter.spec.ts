import { test, expect, type Page } from './fixtures';

/**
 * The Times filter's drag-to-select grid, driven with real pointer events:
 * the component is `setPointerCapture` plus rect arithmetic against a
 * laid-out element, neither of which jsdom provides.
 */

const GRID = '[data-modal-type="time-grid"]';
const BODY = `${GRID} [role="grid"]`;
// Longer than the modal's MODAL_IN/MODAL_OUT transitions plus slack.
const SETTLE_MS = 400;

test.beforeEach(async ({ page }) => {
  // Skip the first-visit welcome tutorial so it doesn't overlay the flow.
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
});

async function openPicker(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
  await page.click('#filter-btn');
  await page.click('#edit-times-btn');
  await expect(page.locator(BODY)).toBeVisible();
  // The dialog is still mid-riseFade when it first becomes visible, so its box
  // would have moved by the time the pointer lands.
  await page.waitForTimeout(SETTLE_MS);
}

const hourLabels = (page: Page) =>
  page.locator(`${GRID} [title^="Select "][title$=" on every day"]`);

/** Minutes after midnight for an hour label like "6:00 AM". */
function labelMin(text: string): number {
  const m = text.trim().match(/^(\d+):00 (AM|PM)$/);
  if (!m) throw new Error(`not an hour label: ${text}`);
  return ((Number(m[1]) % 12) + (m[2] === 'PM' ? 12 : 0)) * 60;
}

/** The hours the picker shows, read off its row labels. */
async function pickerRange(page: Page) {
  const labels = await hourLabels(page).allTextContents();
  const startMin = labelMin(labels[0]);
  return { startMin, endMin: startMin + labels.length * 60 };
}

/**
 * Grid geometry, in viewport pixels: 5 day columns by one row per 30 minutes
 * of the picker's range. `y(min)` is the middle of the row starting at `min`.
 */
async function geometry(page: Page) {
  const r = await page.locator(BODY).boundingBox();
  if (!r) throw new Error('grid body has no box');
  const { startMin, endMin } = await pickerRange(page);
  const rows = (endMin - startMin) / 30;
  return {
    startMin,
    endMin,
    x: (dayIndex: number) => r.x + (r.width / 5) * (dayIndex + 0.5),
    y: (min: number) => r.y + (r.height / rows) * ((min - startMin) / 30 + 0.5),
  };
}

const AT_10AM = 600;
const AT_1130AM = 690;

/** Drags between the rows starting at `from.at` and `to.at` (minutes). */
async function drag(
  page: Page,
  from: { day: number; at: number },
  to: { day: number; at: number },
): Promise<void> {
  const g = await geometry(page);
  await page.mouse.move(g.x(from.day), g.y(from.at));
  await page.mouse.down();
  await page.mouse.move(g.x(to.day), g.y(to.at), { steps: 8 });
  await page.mouse.up();
}

/** The earliest start and latest end over every timed catalog period. */
async function catalogSpan(page: Page) {
  return page.evaluate(() => {
    let startMin = Infinity;
    let endMin = -Infinity;
    const depts = (
      window as any
    ).services.courseDataService.getAllDepartments();
    for (const d of depts)
      for (const c of d.courses)
        for (const lg of c.lectures ?? [])
          for (const s of [
            lg.section,
            ...lg.compatibleDiscussions,
            ...lg.compatibleLabs,
          ])
            for (const p of s.periods) {
              const a = p.startTime.hours * 60 + p.startTime.minutes;
              const b = p.endTime.hours * 60 + p.endTime.minutes;
              if (p.isAsync || p.days.size === 0 || b <= a) continue;
              startMin = Math.min(startMin, a);
              endMin = Math.max(endMin, b);
            }
    return { startMin, endMin };
  });
}

const timesWindows = (page: Page) =>
  page.evaluate(
    () =>
      (window as any).services.filterService.getCriteria('times')?.windows ??
      [],
  );

const summary = (page: Page) => page.locator(`${GRID} [aria-live]`);
const modeButton = (page: Page, mode: 'Only' | 'Avoid') =>
  page.locator(GRID).getByRole('button', { name: `${mode} these times` });
const previewCount = async (page: Page): Promise<number> => {
  const text = (await page.locator('.filter-preview').textContent()) ?? '';
  return Number(text.match(/^(\d+)/)?.[1] ?? NaN);
};

test('dragging a window filters the course list to courses that fit it', async ({
  page,
}) => {
  await openPicker(page);
  const before = await previewCount(page);

  // Tue 10:00 through Thu 11:30 - a Tue/Thu 10-12 gap.
  await drag(page, { day: 1, at: AT_10AM }, { day: 3, at: AT_1130AM });

  await expect(summary(page)).toHaveText(
    'Only Tue, Wed, Thu 10:00 AM-12:00 PM',
  );
  expect(await previewCount(page)).toBeLessThan(before);

  // The panel behind the picker mirrors the same summary once it closes.
  await page.locator(GRID).getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(SETTLE_MS);
  await expect(page.locator('#edit-times-btn').locator('..')).toContainText(
    'Only Tue, Wed, Thu 10:00 AM-12:00 PM',
  );
});

test('dragging back over a painted region erases it', async ({ page }) => {
  await openPicker(page);
  await drag(page, { day: 1, at: AT_10AM }, { day: 3, at: AT_1130AM });
  await expect(summary(page)).toContainText('Tue, Wed, Thu');

  // Starting the drag on an already-painted cell subtracts instead of adding.
  await drag(page, { day: 2, at: AT_10AM }, { day: 2, at: AT_1130AM });
  await expect(summary(page)).toHaveText('Only Tue, Thu 10:00 AM-12:00 PM');
});

test('clearing the grid removes the filter entirely', async ({ page }) => {
  await openPicker(page);
  const before = await previewCount(page);

  await drag(page, { day: 1, at: AT_10AM }, { day: 1, at: AT_1130AM });
  expect(await previewCount(page)).toBeLessThan(before);

  await page.locator(GRID).getByRole('button', { name: 'Clear' }).click();
  await expect(summary(page)).toHaveText('Any time');
  expect(await previewCount(page)).toBe(before);
  expect(
    await page.evaluate(() =>
      (window as any).services.filterService.hasFilter('times'),
    ),
  ).toBe(false);
});

// Clear used to appear only once something was painted, growing the summary
// row and nudging the grid up mid-drag. It is always there now, just disabled.
test('painting the first cell does not move the grid', async ({ page }) => {
  await openPicker(page);
  const clear = page.locator(GRID).getByRole('button', { name: 'Clear' });
  await expect(clear).toBeDisabled();
  const before = await page.locator(BODY).boundingBox();

  await drag(page, { day: 1, at: AT_10AM }, { day: 1, at: AT_1130AM });
  await expect(clear).toBeEnabled();

  expect(await page.locator(BODY).boundingBox()).toEqual(before);
});

test('escape closes only the picker, leaving the filter modal open', async ({
  page,
}) => {
  await openPicker(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(SETTLE_MS);

  await expect(page.locator(GRID)).toHaveCount(0);
  await expect(page.locator('[data-modal-type="filter-modal"]')).toBeVisible();
});

test('a painted selection survives reopening the picker', async ({ page }) => {
  await openPicker(page);
  await drag(page, { day: 1, at: AT_10AM }, { day: 1, at: AT_1130AM });
  await page.locator(GRID).getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(SETTLE_MS);

  await page.click('#edit-times-btn');
  await page.waitForTimeout(SETTLE_MS);
  await expect(summary(page)).toHaveText('Only Tue 10:00 AM-12:00 PM');
});

test('the picker spans every hour the catalog meets', async ({ page }) => {
  await openPicker(page);
  const catalog = await catalogSpan(page);
  // The premise: classes run from before 8 AM to after 8 PM.
  expect(catalog.startMin).toBeLessThan(480);
  expect(catalog.endMin).toBeGreaterThan(1200);

  expect(await pickerRange(page)).toEqual({
    startMin: Math.floor(catalog.startMin / 60) * 60,
    endMin: Math.ceil(catalog.endMin / 60) * 60,
  });
});

test('one svg overlay draws a line per hour, half hour and day', async ({
  page,
}) => {
  await openPicker(page);
  const { startMin, endMin } = await pickerRange(page);
  const hours = (endMin - startMin) / 60;

  // A background gradient whose stripe is not a whole pixel tall drops most
  // of its 1px lines in Firefox; scale-free crisp strokes always land on one.
  const overlay = page.locator(`${BODY} > svg`);
  await expect(overlay).toHaveCount(1);
  await expect(overlay).toHaveAttribute('aria-hidden', 'true');
  await expect(overlay).toHaveAttribute('preserveAspectRatio', 'none');
  expect(await overlay.evaluate(el => getComputedStyle(el).pointerEvents)).toBe(
    'none',
  );
  expect(
    await page
      .locator(BODY)
      .evaluate(el => getComputedStyle(el).backgroundImage),
  ).toBe('none');

  // Interior lines only: the body's edges sit against the grid's borders.
  await expect(overlay.locator('line[data-line="hour"]')).toHaveCount(
    hours - 1,
  );
  await expect(overlay.locator('line[data-line="half"]')).toHaveCount(hours);
  await expect(overlay.locator('line[data-line="day"]')).toHaveCount(4);

  const stroke = await overlay
    .locator('line')
    .first()
    .evaluate(el => ({
      effect: getComputedStyle(el).getPropertyValue('vector-effect'),
      rendering: getComputedStyle(el).getPropertyValue('shape-rendering'),
    }));
  expect(stroke).toEqual({
    effect: 'non-scaling-stroke',
    rendering: 'crispedges',
  });
});

test('painting every day as Only, with async included, keeps every course', async ({
  page,
}) => {
  await openPicker(page);
  const before = await previewCount(page);

  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
    await page
      .locator(GRID)
      .getByRole('button', { name: day, exact: true })
      .click();
  }
  const { startMin, endMin } = await pickerRange(page);
  expect(await timesWindows(page)).toHaveLength(5);
  for (const w of await timesWindows(page)) {
    expect(w).toMatchObject({ startMin, endMin });
  }
  // Every timed course fits; async-only ones wait for the toggle.
  expect(await previewCount(page)).toBeLessThan(before);
  await page.check('#include-async-filter');
  expect(await previewCount(page)).toBe(before);
});

test('avoiding the hours before 8 AM hides sections that start then', async ({
  page,
}) => {
  await openPicker(page);
  const before = await previewCount(page);
  const { startMin } = await pickerRange(page);

  await modeButton(page, 'Avoid').click();
  await drag(page, { day: 0, at: startMin }, { day: 4, at: 450 });
  expect(await timesWindows(page)).toHaveLength(5);
  for (const w of await timesWindows(page)) {
    expect(w).toMatchObject({ startMin, endMin: 480 });
  }
  expect(await previewCount(page)).toBeLessThan(before);

  // Every section the list still offers meets no earlier than 8:00.
  const earliest = await page.evaluate(() => {
    const { courseDataService, filterService } = (window as any).services;
    const courses = courseDataService
      .getAllDepartments()
      .flatMap((d: any) => d.courses);
    let min = Infinity;
    for (const fs of filterService.apply(courses))
      for (const p of fs.section.periods) {
        const a = p.startTime.hours * 60 + p.startTime.minutes;
        const b = p.endTime.hours * 60 + p.endTime.minutes;
        if (!p.isAsync && p.days.size > 0 && b > a) min = Math.min(min, a);
      }
    return min;
  });
  expect(earliest).toBeGreaterThanOrEqual(480);
});

test('async classes are left out of "only" times unless included, and kept when avoiding', async ({
  page,
}) => {
  await openPicker(page);
  const toggle = page.locator('#include-async-filter');
  const asyncShown = () =>
    page.evaluate(() => {
      const svc: any = (window as any).services;
      const isAsync = (s: any) =>
        s.periods.every((p: any) => p.isAsync || p.days.size === 0);
      const courses = svc.courseDataService
        .getAllDepartments()
        .flatMap((d: any) => d.courses);
      return svc.filterService
        .apply(courses)
        .some((fs: any) => isAsync(fs.section));
    });
  const storedIncludeAsync = () =>
    page.evaluate(
      () =>
        (window as any).services.filterService.getCriteria('times')
          ?.includeAsync,
    );

  // Nothing painted: no constraint, async classes stay.
  expect(await asyncShown()).toBe(true);

  // Painting times to keep (here: the first hour) leaves async classes out.
  const { startMin } = await pickerRange(page);
  await drag(page, { day: 0, at: startMin }, { day: 4, at: startMin + 30 });
  await page
    .locator(GRID)
    .getByRole('button', { name: 'Only these times' })
    .click();
  await expect(toggle).not.toBeChecked();
  expect(await asyncShown()).toBe(false);

  await toggle.check();
  expect(await asyncShown()).toBe(true);
  expect(await storedIncludeAsync()).toBe(true);

  // Avoiding times keeps classes with no set times anyway, so the toggle
  // goes away and nothing is stored for it.
  await page
    .locator(GRID)
    .getByRole('button', { name: 'Avoid these times' })
    .click();
  await expect(toggle).toHaveCount(0);
  expect(await asyncShown()).toBe(true);
  expect(await storedIncludeAsync()).toBeUndefined();

  // Back to "only", the choice is still there and survives reopening.
  await page
    .locator(GRID)
    .getByRole('button', { name: 'Only these times' })
    .click();
  await expect(toggle).toBeChecked();
  await page.locator(GRID).getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(SETTLE_MS);
  await expect(page.locator('#edit-times-btn').locator('..')).toContainText(
    'async included',
  );
  await page.click('#edit-times-btn');
  await page.waitForTimeout(SETTLE_MS);
  await expect(page.locator('#include-async-filter')).toBeChecked();
});

test('the mode buttons sit on one line, centred over the grid', async ({
  page,
}) => {
  await openPicker(page);
  const only = page
    .locator(GRID)
    .getByRole('button', { name: 'Only these times' });
  const avoid = page
    .locator(GRID)
    .getByRole('button', { name: 'Avoid these times' });
  const [o, a] = [(await only.boundingBox())!, (await avoid.boundingBox())!];
  // Same height: neither label wraps onto a second line.
  expect(Math.abs(o.height - a.height)).toBeLessThanOrEqual(1);
  expect(o.height).toBeLessThan(40);

  const grid = (await page.locator(`${GRID} [role="grid"]`).boundingBox())!;
  const dialog = (await page.locator(`${GRID} .modal-dialog`).boundingBox())!;
  const centre = (o.x + a.x + a.width) / 2;
  expect(Math.abs(centre - (dialog.x + dialog.width / 2))).toBeLessThanOrEqual(
    2,
  );
  expect(o.y + o.height).toBeLessThan(grid.y);
});

test('the async toggle sits at the bottom right, beside Done', async ({
  page,
}) => {
  await openPicker(page);
  const footer = page.locator(`${GRID} .modal-footer`);
  await expect(footer.locator('#include-async-filter')).toHaveCount(1);
  const done = (await footer
    .getByRole('button', { name: 'Done' })
    .boundingBox())!;
  const toggle = (await footer.locator('.filter-toggle-label').boundingBox())!;
  expect(toggle.x + toggle.width).toBeLessThanOrEqual(done.x);
  expect(
    Math.abs(toggle.y + toggle.height / 2 - (done.y + done.height / 2)),
  ).toBeLessThanOrEqual(4);
});

/**
 * Everything the picker shows must be on screen at once: a scrolling body
 * slides the top rows under the header mid-drag, and on touch the grid itself
 * blocks the scroll gesture.
 */
async function expectPickerFits(page: Page): Promise<void> {
  // Something painted, so the summary's Clear button is showing too.
  const { startMin, endMin } = await geometry(page);
  await drag(page, { day: 0, at: startMin }, { day: 0, at: startMin });
  await expect(
    page.locator(GRID).getByRole('button', { name: 'Clear' }),
  ).toBeVisible();

  const body = page.locator(`${GRID} .modal-body`);
  const { scrollHeight, clientHeight } = await body.evaluate(el => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1);

  for (const control of [
    page.locator(BODY),
    page.locator(GRID).getByRole('button', { name: 'Clear' }),
    page.locator(GRID).getByRole('button', { name: 'Done' }),
    page.locator(`${GRID} p`),
    summary(page),
  ]) {
    // Not quite 1: a fractional box can lose a sliver to rounding.
    await expect(control).toBeInViewport({ ratio: 0.99 });
  }

  // The pixel->row math still lands on the first and last rows, which the
  // wider range has made the shortest they have been.
  await page.locator(GRID).getByRole('button', { name: 'Clear' }).click();
  for (const at of [startMin, endMin - 30]) {
    await drag(page, { day: 4, at }, { day: 4, at });
    expect(await timesWindows(page)).toEqual([
      { day: 'F', startMin: at, endMin: at + 30 },
    ]);
    await page.locator(GRID).getByRole('button', { name: 'Clear' }).click();
  }
}

for (const size of [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
]) {
  test(`the whole picker fits at ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openPicker(page);
    await expectPickerFits(page);
  });
}

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  test('the whole picker fits at 390x844', async ({ page }) => {
    await openPicker(page);
    await expect(page.locator('html.is-mobile')).toHaveCount(1);
    await expectPickerFits(page);
  });
});

const THEMES = ['wpi-dark', 'wpi-light', 'wpi-classic', 'high-contrast'];

async function useTheme(page: Page, theme: string): Promise<void> {
  await page.addInitScript(
    t =>
      localStorage.setItem(
        'wpi-planner-preferences',
        JSON.stringify({ theme: t }),
      ),
    theme,
  );
}

for (const theme of THEMES) {
  test(`avoid paint is patterned apart from only paint in ${theme}`, async ({
    page,
  }) => {
    await useTheme(page, theme);
    await openPicker(page);
    await drag(page, { day: 1, at: AT_10AM }, { day: 1, at: AT_1130AM });

    const painted = page.locator(`${BODY} > [class*="painted"]`).first();
    const image = () =>
      painted.evaluate(el => getComputedStyle(el).backgroundImage);
    // Every theme's primary and danger are both red, so colour alone cannot
    // tell the modes apart; Avoid carries a hatch on top.
    expect(await image()).toBe('none');
    await modeButton(page, 'Avoid').click();
    expect(await image()).toContain('linear-gradient');
  });
}

test('the chosen mode survives reopening with nothing painted', async ({
  page,
}) => {
  await openPicker(page);
  await modeButton(page, 'Avoid').click();
  await page.locator(GRID).getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(SETTLE_MS);

  await page.click('#edit-times-btn');
  await page.waitForTimeout(SETTLE_MS);
  await expect(modeButton(page, 'Avoid')).toHaveClass(/\bactive\b/);

  // Painting now applies the remembered mode.
  await drag(page, { day: 1, at: AT_10AM }, { day: 1, at: AT_1130AM });
  await expect(summary(page)).toHaveText('Avoid Tue 10:00 AM-12:00 PM');
});

/** Focuses the grid, which puts the focus on Mon's first row, then moves it
 * down to the row starting at `min`. */
async function focusAt(page: Page, min: number): Promise<void> {
  const { startMin } = await pickerRange(page);
  await page.locator(BODY).focus();
  for (let at = startMin; at < min; at += 30) {
    await page.keyboard.press('ArrowDown');
  }
}

test('the keyboard reaches both ends of the range', async ({ page }) => {
  await openPicker(page);
  const { startMin, endMin } = await pickerRange(page);
  await page.locator(BODY).focus();

  // Focus starts on the first row.
  await page.keyboard.press('Space');
  expect(await timesWindows(page)).toEqual([
    { day: 'M', startMin, endMin: startMin + 30 },
  ]);

  // End jumps to the last row; Shift+ArrowUp grows the rectangle back up.
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+ArrowUp');
  expect(await timesWindows(page)).toEqual([
    { day: 'M', startMin, endMin: startMin + 30 },
    { day: 'M', startMin: endMin - 60, endMin },
  ]);
});

test('shift and arrow keys paint a rectangle from the anchor', async ({
  page,
}) => {
  await openPicker(page);
  await focusAt(page, 480);

  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(summary(page)).toHaveText('Only Mon, Tue 8:00-9:00 AM');

  // Like dragging back, moving toward the anchor shrinks the rectangle.
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(summary(page)).toHaveText('Only Mon 8:00-9:00 AM');
});

test('space then shift and arrow keys keeps painting', async ({ page }) => {
  await openPicker(page);
  await focusAt(page, 480);

  // Space toggles the anchor on, like pressing the mouse on an empty cell,
  // so extending from it paints rather than erasing.
  await page.keyboard.press('Space');
  await expect(summary(page)).toHaveText('Only Mon 8:00-8:30 AM');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(summary(page)).toHaveText('Only Mon, Tue 8:00-8:30 AM');

  // A run started on a painted cell without Space erases, as a drag would.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(summary(page)).toHaveText('Any time');
});

/** WCAG contrast ratio between two computed `rgb(...)` colours. */
function contrast(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(v => {
      const s = Number(v) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('the active mode is clear in high contrast', async ({ page }) => {
  await useTheme(page, 'high-contrast');
  await openPicker(page);
  // Let the theme class and the toggle's own transition land.
  await page.waitForTimeout(SETTLE_MS);

  /** Text colour, and the first opaque background at or above the button. */
  const look = (mode: 'Only' | 'Avoid') =>
    modeButton(page, mode).evaluate(el => {
      let bg = 'rgb(255, 255, 255)';
      for (let n: Element | null = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) {
          bg = c;
          break;
        }
      }
      return { color: getComputedStyle(el).color, bg };
    });

  const active = await look('Only');
  const inactive = await look('Avoid');
  expect(contrast(inactive.color, inactive.bg)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(active.color, active.bg)).toBeGreaterThanOrEqual(4.5);
  // The two states must read as different fills, not just different text.
  expect(contrast(active.bg, inactive.bg)).toBeGreaterThanOrEqual(3);
});
