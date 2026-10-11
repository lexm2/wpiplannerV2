import { test, expect, type Page } from '@playwright/test';

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

/** Grid geometry, in viewport pixels: 5 day columns by 24 half-hour rows. */
async function geometry(page: Page) {
  const r = await page.locator(BODY).boundingBox();
  if (!r) throw new Error('grid body has no box');
  return {
    x: (dayIndex: number) => r.x + (r.width / 5) * (dayIndex + 0.5),
    y: (row: number) => r.y + (r.height / 24) * (row + 0.5),
  };
}

/** Row 4 is 10:00 AM (row 0 is 8:00, half-hour rows). */
const ROW_10AM = 4;
const ROW_1130AM = 7;

async function drag(
  page: Page,
  from: { day: number; row: number },
  to: { day: number; row: number },
): Promise<void> {
  const g = await geometry(page);
  await page.mouse.move(g.x(from.day), g.y(from.row));
  await page.mouse.down();
  await page.mouse.move(g.x(to.day), g.y(to.row), { steps: 8 });
  await page.mouse.up();
}

const summary = (page: Page) => page.locator(`${GRID} [aria-live]`);
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
  await drag(page, { day: 1, row: ROW_10AM }, { day: 3, row: ROW_1130AM });

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
  await drag(page, { day: 1, row: ROW_10AM }, { day: 3, row: ROW_1130AM });
  await expect(summary(page)).toContainText('Tue, Wed, Thu');

  // Starting the drag on an already-painted cell subtracts instead of adding.
  await drag(page, { day: 2, row: ROW_10AM }, { day: 2, row: ROW_1130AM });
  await expect(summary(page)).toHaveText('Only Tue, Thu 10:00 AM-12:00 PM');
});

test('clearing the grid removes the filter entirely', async ({ page }) => {
  await openPicker(page);
  const before = await previewCount(page);

  await drag(page, { day: 1, row: ROW_10AM }, { day: 1, row: ROW_1130AM });
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
  await drag(page, { day: 1, row: ROW_10AM }, { day: 1, row: ROW_1130AM });
  await page.locator(GRID).getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(SETTLE_MS);

  await page.click('#edit-times-btn');
  await page.waitForTimeout(SETTLE_MS);
  await expect(summary(page)).toHaveText('Only Tue 10:00 AM-12:00 PM');
});

test('the async toggle hides sections with no meeting time', async ({
  page,
}) => {
  await openPicker(page);
  const before = await previewCount(page);

  await page.uncheck('#include-async-filter');
  expect(await previewCount(page)).toBeLessThan(before);
  expect(
    await page.evaluate(() =>
      (window as any).services.filterService.hasFilter('async'),
    ),
  ).toBe(true);

  // The panel behind the picker reports it alongside the time summary.
  await page.locator(GRID).getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(SETTLE_MS);
  await expect(page.locator('#edit-times-btn').locator('..')).toContainText(
    'Any time • no async',
  );

  // Re-checking it drops the filter rather than storing a no-op criteria.
  await page.click('#edit-times-btn');
  await page.waitForTimeout(SETTLE_MS);
  await page.check('#include-async-filter');
  expect(await previewCount(page)).toBe(before);
  expect(
    await page.evaluate(() =>
      (window as any).services.filterService.hasFilter('async'),
    ),
  ).toBe(false);
});

/**
 * Everything the picker shows must be on screen at once: a scrolling body
 * slides the top rows under the header mid-drag, and on touch the grid itself
 * blocks the scroll gesture.
 */
async function expectPickerFits(page: Page): Promise<void> {
  // Something painted, so the summary's Clear button is showing too.
  await drag(page, { day: 0, row: 0 }, { day: 0, row: 0 });
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

  // The pixel->row math still lands on the last row: 7:30 PM is row 23.
  await page.locator(GRID).getByRole('button', { name: 'Clear' }).click();
  await drag(page, { day: 4, row: 23 }, { day: 4, row: 23 });
  await expect(summary(page)).toHaveText('Only Fri 7:30-8:00 PM');
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
    // The phone notice opens over everything on load.
    await page.addInitScript(() => {
      const dismiss = () =>
        [...document.querySelectorAll('button')]
          .find(b => b.textContent?.trim() === 'Got it')
          ?.click();
      new MutationObserver(dismiss).observe(document, {
        childList: true,
        subtree: true,
      });
    });
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

const modeButton = (page: Page, mode: 'Only' | 'Avoid') =>
  page.locator(GRID).getByRole('button', { name: `${mode} these times` });

for (const theme of THEMES) {
  test(`avoid paint is patterned apart from only paint in ${theme}`, async ({
    page,
  }) => {
    await useTheme(page, theme);
    await openPicker(page);
    await drag(page, { day: 1, row: ROW_10AM }, { day: 1, row: ROW_1130AM });

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
  await drag(page, { day: 1, row: ROW_10AM }, { day: 1, row: ROW_1130AM });
  await expect(summary(page)).toHaveText('Avoid Tue 10:00 AM-12:00 PM');
});
