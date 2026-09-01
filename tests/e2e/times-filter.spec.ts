import { test, expect, type Page } from '@playwright/test';

/**
 * The Times filter's drag-to-select grid.
 *
 * Driven with real pointer events rather than a unit test: the whole point of
 * the component is `setPointerCapture` plus rect arithmetic against a laid-out
 * element, neither of which jsdom provides.
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
  // The dialog is still mid-riseFade when it first becomes visible; measuring
  // the grid now would read a box that has moved by the time the pointer lands.
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
