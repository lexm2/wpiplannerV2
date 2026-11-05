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

test('renaming edits the name where it stands', async ({ page }) => {
  await load(page);
  await page.click('#schedule-picker-btn');
  const row = firstRow(page);
  const rename = row.getByRole('button', { name: 'Rename' });
  // Hovering waits out the window's opening animation.
  await rename.hover();
  const letters = (el: Element) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const { x, y } = range.getBoundingClientRect();
    return { x, y };
  };
  const height = () => row.evaluate(el => el.getBoundingClientRect().height);
  const rest = await row.locator('.schedule-item-name').evaluate(letters);
  const restHeight = await height();

  await rename.click();
  const name = row.getByRole('textbox', { name: 'Schedule name' });
  await expect(name).toBeFocused();
  const editing = await name.evaluate(letters);
  expect(editing.x).toBeCloseTo(rest.x, 0);
  expect(editing.y).toBeCloseTo(rest.y, 0);
  expect(await height()).toBeCloseTo(restHeight, 0);

  // The whole name starts selected, so one key deletes it all.
  await page.keyboard.press('Backspace');
  await expect(name).toHaveText('');
  expect(await height()).toBeCloseTo(restHeight, 0);

  // Whatever a paste brings, a name stays on one line.
  await page.evaluate(() =>
    document.execCommand('insertText', false, 'Line one\nLine two'),
  );
  await page.keyboard.press('Enter');
  await expect(row.locator('.schedule-item-name')).toHaveText(
    'Line one Line two',
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

test('a failed import of a new schedule leaves no empty schedule behind', async ({
  page,
}) => {
  await load(page);
  await page.click('#schedule-picker-btn');

  const chooser = page.waitForEvent('filechooser');
  await page.click('#import-schedule-btn');
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
  test('at wide widths the row shows Rename and Duplicate beside it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await load(page);
    await page.click('#schedule-picker-btn');
    const row = firstRow(page);
    await expect(row.getByRole('button', { name: 'Rename' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Duplicate' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Export' })).toBeHidden();
    await row.getByTitle('More options').click();
    const menu = row.locator('[data-visible="true"]');
    await expect(
      menu.getByRole('menuitem', { name: 'Export ICS' }),
    ).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Import' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeHidden();
  });

  test('at narrow widths it holds every action', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 700 });
    await load(page);
    await page.click('#settings-menu-btn');
    await page.locator('#settings-schedules-btn').click();
    const row = firstRow(page);
    await expect(row.getByRole('button', { name: 'Rename' })).toBeHidden();
    await row.getByTitle('More options').click();
    await expect(
      row.locator('[data-visible="true"]').getByRole('menuitem', {
        name: 'Rename',
      }),
    ).toBeVisible();
  });
});

test('a schedule can be switched to from the keyboard', async ({ page }) => {
  await load(page);
  await page.evaluate(() =>
    (window as any).services.scheduleManagementService.createNewSchedule(
      'Second plan',
    ),
  );
  await page.click('#schedule-picker-btn');
  const rows = page.locator(`${PICKER} .schedule-item`);
  await expect(rows.nth(1).locator('.schedule-item-name')).toHaveAttribute(
    'aria-current',
    'true',
  );

  await rows.nth(0).locator('.schedule-item-name').focus();
  await page.keyboard.press('Enter');
  await expect(rows.nth(0).locator('.schedule-item-name')).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('a click on the backdrop closes an open menu but not the window', async ({
  page,
}) => {
  await load(page);
  await page.click('#schedule-picker-btn');
  const menu = page.locator(`${PICKER} [data-visible="true"]`);
  await firstRow(page).getByTitle('More options').click();
  await expect(menu).toBeVisible();

  await page.mouse.click(4, 450);
  await expect(menu).toHaveCount(0);
  await expect(page.locator(PICKER)).toBeVisible();

  await page.mouse.click(4, 450);
  await expect(page.locator(PICKER)).toHaveCount(0);
});
