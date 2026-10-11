import { test, expect, type Page } from './fixtures';

/** Schedule picker basics: renaming, importing, and the undo button state. */

const PICKER = '[data-modal-type="schedule-picker"]';

test.beforeEach(async ({ page }) => {
  // Skip the first-visit welcome tutorial so it doesn't overlay the flow.
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
});

async function load(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate(() =>
    (window as any).services.scheduleManagementService.initialize(),
  );
}

const firstRow = (page: Page) =>
  page.locator(`${PICKER} .schedule-item`).first();

test('the Rename button puts the cursor in the name field', async ({
  page,
}) => {
  await load(page);
  await page.click('#schedule-picker-btn');
  await firstRow(page).getByRole('button', { name: 'Rename' }).click();

  const field = firstRow(page).getByRole('textbox', { name: 'Schedule name' });
  await expect(field).toBeFocused();
  await page.keyboard.type('Renamed');
  await page.keyboard.press('Enter');

  await expect(firstRow(page).locator('.schedule-item-name')).toHaveText(
    'Renamed',
  );
});

test('Escape cancels a rename and leaves the picker open', async ({ page }) => {
  await load(page);
  await page.click('#schedule-picker-btn');
  const name = firstRow(page).locator('.schedule-item-name');
  const before = (await name.textContent())?.trim();

  await name.dblclick();
  const field = firstRow(page).getByRole('textbox', { name: 'Schedule name' });
  await expect(field).toBeFocused();
  await page.keyboard.type('XX');
  await page.keyboard.press('Escape');

  await expect(page.locator(PICKER)).toBeVisible();
  await expect(name).toHaveText(before!);
  const stored = await page.evaluate(
    () =>
      (window as any).services.scheduleManagementService.getAllSchedules()[0]
        .name,
  );
  expect(stored).toBe(before);
});

test('a failed import from Settings leaves no empty schedule behind', async ({
  page,
}) => {
  await load(page);
  await page.click('#schedule-picker-btn');
  await page.locator(`${PICKER} .nav-tab[data-tab="settings"]`).click();

  const chooser = page.waitForEvent('filechooser');
  await page.click('#import-schedule-btn-settings');
  await (
    await chooser
  ).setFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('not json'),
  });

  const banner = page.locator('.error-banner');
  await expect(banner).toBeVisible();
  // One "Import failed", not "Import failed: Import failed: ...".
  expect(
    ((await banner.textContent()) ?? '').match(/Import failed/g),
  ).toHaveLength(1);

  const names = await page.evaluate(() =>
    (window as any).services.scheduleManagementService
      .getAllSchedules()
      .map((s: any) => s.name),
  );
  expect(names).not.toContain('bad');
});

test('undo starts disabled on a fresh load', async ({ page }) => {
  await load(page);
  await expect(page.locator('#undo-btn')).toBeDisabled();
});

test.describe('More options button', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('is hidden while every action shows inline', async ({ page }) => {
    await load(page);
    await page.click('#schedule-picker-btn');
    const row = firstRow(page);
    await expect(row.getByRole('button', { name: 'Rename' })).toBeVisible();
    await expect(row.getByTitle('More options')).toBeHidden();
  });

  test('comes back when the actions no longer fit', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 700 });
    await load(page);
    await page.click('#settings-menu-btn');
    await page
      .locator('#settings-dropdown-menu .settings-menu-item')
      .first()
      .click();
    const row = firstRow(page);
    await expect(row.getByRole('button', { name: 'Rename' })).toBeHidden();
    await expect(row.getByTitle('More options')).toBeVisible();
  });
});
