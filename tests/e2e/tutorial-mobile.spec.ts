import { test, expect, type Page } from './fixtures';

/**
 * The interactive tutorial is desktop-only: on a phone (narrow layout, or a
 * phone user agent at any width) it never starts and is not offered.
 */

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

const SKIP = '[data-tutorial-skip]';

async function appLoaded(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments().length >
      0,
  );
}

/** Open the schedule picker (via the gear menu on a narrow window) on Settings. */
async function openSettingsTab(page: Page): Promise<void> {
  const direct = page.locator('#schedule-picker-btn');
  if (await direct.isVisible()) {
    await direct.click();
  } else {
    await page.click('.settings-menu-btn');
    await page.getByRole('button', { name: 'Schedules' }).click();
  }
  // A short landscape window can clip the tab bar; the settings page is in the
  // DOM either way, which is what the assertions below read.
  const tab = page.locator(
    '[data-modal-type="schedule-picker"] [data-tab="settings"]',
  );
  if (await tab.isVisible()) await tab.click();
  await expect(page.locator('#clear-all-data-btn-settings')).toHaveCount(1);
}

async function expectNoTutorialNorButton(page: Page): Promise<void> {
  // Give a would-be auto-start time to show itself.
  await page.waitForTimeout(1500);
  await expect(page.locator(SKIP)).toHaveCount(0);
  await expect(page.locator('.tutorial-highlight-svg')).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem('wpi_visited')),
  ).toBeNull();

  await openSettingsTab(page);
  await expect(page.locator('#tutorials-btn-settings')).toHaveCount(0);
}

test.describe('phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('first visit starts no tutorial and offers none', async ({ page }) => {
    await appLoaded(page);
    await expectNoTutorialNorButton(page);
  });
});

test.describe('phone in landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, userAgent: IPHONE_UA });

  test('first visit starts no tutorial and offers none', async ({ page }) => {
    await appLoaded(page);
    await expectNoTutorialNorButton(page);
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('narrowing to a phone ends the running tutorial', async ({ page }) => {
    await appLoaded(page);
    await expect(page.locator(SKIP)).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(SKIP)).toHaveCount(0);
    await expect(page.locator('.tutorial-highlight-svg')).toHaveCount(0);

    // The app is usable afterwards: the picker opens with no tutorial button.
    await openSettingsTab(page);
    await expect(page.locator('#tutorials-btn-settings')).toHaveCount(0);
  });
});
