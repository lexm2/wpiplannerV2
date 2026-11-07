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

/** Open the gear menu, where Clear All Data always is and Tutorials sometimes. */
async function openSettingsMenu(page: Page): Promise<void> {
  await page.click('.settings-menu-btn');
  await expect(page.locator('#clear-all-data-btn')).toHaveCount(1);
}

async function expectNoTutorialNorButton(page: Page): Promise<void> {
  // Give a would-be auto-start time to show itself.
  await page.waitForTimeout(1500);
  await expect(page.locator(SKIP)).toHaveCount(0);
  await expect(page.locator('.tutorial-highlight-svg')).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem('wpi_visited')),
  ).toBeNull();

  await openSettingsMenu(page);
  await expect(page.locator('#tutorials-btn')).toHaveCount(0);
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

    // The app is usable afterwards: the menu opens with no tutorial button.
    await openSettingsMenu(page);
    await expect(page.locator('#tutorials-btn')).toHaveCount(0);
  });
});

test.describe('collapsed header', () => {
  test.use({ viewport: { width: 1100, height: 800 } });

  // The header hides the Schedules button here, so the Managing Schedules
  // tutorial points at the gear and advances on choosing Schedules in its menu.
  test('the schedules tutorial opens through the gear menu', async ({
    page,
  }) => {
    await appLoaded(page);
    await expect(page.locator(SKIP)).toBeVisible();
    await page.evaluate(() =>
      (window as any).services.tutorial.start('schedules'),
    );

    await expect(page.locator('#schedule-picker-btn')).toBeHidden();
    const gear = page.locator('#settings-menu-btn');
    const outline = '.tutorial-highlight-svg';
    await expect(gear.locator(outline)).toBeAttached();

    // The outline is always on what to click next, so it follows the menu.
    const schedules = page.locator('#settings-schedules-btn');
    await gear.click();
    await expect(schedules.locator(outline)).toBeAttached();
    await expect(gear.locator(outline)).toHaveCount(0);
    // The menu scrolls, so anything drawn past its edge would be cut off.
    await expect
      .poll(() =>
        schedules.locator(`${outline} rect`).evaluate(rect => {
          const r = rect.getBoundingClientRect();
          const m = rect
            .closest('.settings-dropdown-menu')!
            .getBoundingClientRect();
          return (
            r.left >= m.left &&
            r.top >= m.top &&
            r.right <= m.right &&
            r.bottom <= m.bottom
          );
        }),
      )
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect(gear.locator(outline)).toBeAttached();

    await gear.click();
    await schedules.click();
    await expect(page.locator('.schedule-picker-modal-dialog')).toBeVisible();
    expect(
      await page.evaluate(() =>
        (window as any).services.tutorial.service.getCurrentStepIndex(),
      ),
    ).toBe(1);
  });
});
