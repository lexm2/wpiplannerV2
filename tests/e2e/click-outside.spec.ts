import { test, expect, type Page } from './fixtures';
import { fileURLToPath } from 'node:url';

/**
 * Every dropdown closes when you click anywhere outside it - including inside a
 * modal, whose dialog stops click propagation, and on controls that stop it
 * themselves (another menu's toggle). Clicking a menu's own toggle toggles it,
 * and its items still run.
 */

const PICKER = '[data-modal-type="schedule-picker"]';
const fixture = fileURLToPath(
  new URL('../fixtures/academic-progress-sample.xlsx', import.meta.url),
);

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
}

/** Modals rise in; clicking before that settles lands on stale coordinates. */
const settleModal = (page: Page) =>
  page.waitForFunction(() => {
    const el = document.querySelector('.modal-dialog');
    return !!el && el.getAnimations().length === 0;
  });

const settingsMenu = (page: Page) => page.locator('#settings-dropdown-menu');
const themeOptions = (page: Page) => page.locator('#theme-options');

/** A listed course's bookmark button stops click propagation. */
const bookmark = (page: Page) => page.getByTitle('Add bookmark').first();

test.describe('schedule picker More options menu', () => {
  test.use({ viewport: { width: 1000, height: 700 } });

  async function openPicker(page: Page): Promise<void> {
    await load(page);
    await page.evaluate(async () => {
      const sms = (window as any).services.scheduleManagementService;
      await sms.initialize();
      await sms.createNewSchedule('Second', { autoActivate: false });
    });
    await page.click('#settings-menu-btn');
    await settingsMenu(page).locator('.settings-menu-item').first().click();
    await settleModal(page);
  }

  const rows = (page: Page) => page.locator(`${PICKER} .schedule-item`);
  const openMenu = (page: Page) =>
    page.locator(`${PICKER} [data-visible="true"]`);

  test('closes on a click elsewhere inside the dialog', async ({ page }) => {
    await openPicker(page);
    await rows(page).first().getByTitle('More options').click();
    await expect(openMenu(page)).toHaveCount(1);

    await page.locator(`${PICKER} .modal-title`).click();
    await expect(openMenu(page)).toHaveCount(0);
    // The click was only spent on the menu: the picker stays open.
    await expect(page.locator(PICKER)).toBeVisible();
  });

  test('its toggle button opens and closes it', async ({ page }) => {
    await openPicker(page);
    const more = rows(page).first().getByTitle('More options');
    await more.click();
    await expect(openMenu(page)).toHaveCount(1);
    await more.click();
    await expect(openMenu(page)).toHaveCount(0);
  });

  test("another row's toggle moves the menu there", async ({ page }) => {
    await openPicker(page);
    await rows(page).nth(0).getByTitle('More options').click();
    await rows(page).nth(1).getByTitle('More options').click();
    await expect(openMenu(page)).toHaveCount(1);
    await expect(
      rows(page).nth(1).locator('[data-visible="true"]'),
    ).toHaveCount(1);
  });

  test('its items still run', async ({ page }) => {
    await openPicker(page);
    const row = rows(page).nth(1);
    await row.getByTitle('More options').click();
    await row
      .locator('[data-visible="true"]')
      .getByRole('button', { name: 'Rename' })
      .click();
    await expect(openMenu(page)).toHaveCount(0);
    await expect(row.getByLabel('Schedule name')).toBeFocused();
  });
});

// The settings menu stands in for the header controls below 1250px; above it
// the theme dropdown shows instead.
test.describe('settings dropdown', () => {
  test.use({ viewport: { width: 1000, height: 700 } });

  test('its toggle button opens and closes it', async ({ page }) => {
    await load(page);
    await page.click('#settings-menu-btn');
    await expect(settingsMenu(page)).toBeVisible();
    await page.click('#settings-menu-btn');
    await expect(settingsMenu(page)).toHaveCount(0);
  });

  test('closes on a click on the page', async ({ page }) => {
    await load(page);
    await page.click('#settings-menu-btn');
    await expect(settingsMenu(page)).toBeVisible();
    await page.getByRole('textbox', { name: 'Search courses' }).click();
    await expect(settingsMenu(page)).toHaveCount(0);
  });

  test('closes on a click on a control that stops propagation', async ({
    page,
  }) => {
    await load(page);
    await page.click('#settings-menu-btn');
    await expect(settingsMenu(page)).toBeVisible();
    await bookmark(page).click();
    await expect(settingsMenu(page)).toHaveCount(0);
    // The click still reached the control.
    await expect(page.getByTitle('Remove bookmark')).toHaveCount(1);
  });

  test('its items still run, then it closes', async ({ page }) => {
    await load(page);
    const name = page.locator('#current-theme-name');
    const before = await name.textContent();
    await page.click('#settings-menu-btn');
    await page.click('#settings-theme-btn');
    await expect(name).not.toHaveText(before ?? '');
    await expect(settingsMenu(page)).toHaveCount(0);
  });
});

test.describe('theme dropdown', () => {
  test('its toggle button opens and closes it', async ({ page }) => {
    await load(page);
    await page.click('#theme-dropdown');
    await expect(themeOptions(page)).toBeVisible();
    await page.click('#theme-dropdown');
    await expect(themeOptions(page)).toHaveCount(0);
  });

  test('closes on a click on the page', async ({ page }) => {
    await load(page);
    await page.click('#theme-dropdown');
    await expect(themeOptions(page)).toBeVisible();
    await page.locator('.app-header h1').click();
    await expect(themeOptions(page)).toHaveCount(0);
  });

  test('closes on a click on a control that stops propagation', async ({
    page,
  }) => {
    await load(page);
    await page.click('#theme-dropdown');
    await expect(themeOptions(page)).toBeVisible();
    await bookmark(page).click();
    await expect(themeOptions(page)).toHaveCount(0);
    await expect(page.getByTitle('Remove bookmark')).toHaveCount(1);
  });

  test('its options still apply, then it closes', async ({ page }) => {
    await load(page);
    await page.click('#theme-dropdown');
    const option = themeOptions(page).locator(
      'button[data-theme-id]:not([class*="active"])',
    );
    const id = await option.first().getAttribute('data-theme-id');
    await option.first().click();
    await expect(themeOptions(page)).toHaveCount(0);
    await expect(page.locator('body')).toHaveClass(
      new RegExp(`\\btheme-${id}\\b`),
    );
  });
});

test.describe('assign menu', () => {
  /** Import a transcript and put CS 1004 in the schedule, unplaced. */
  async function setup(page: Page): Promise<void> {
    await page.goto('/');
    await page.click('#degree-tab');
    await page.setInputFiles('#degree-import-file', fixture);
    await page.locator('.degree-summary-title').waitFor();
    const warning = page.locator('[data-modal-type="degree-import-warning"]');
    await warning.getByRole('button', { name: 'Got it' }).click();
    await warning.waitFor({ state: 'detached' });
    await page.waitForFunction(
      () =>
        (window as any).services?.courseDataService?.getAllDepartments()
          ?.length > 0,
      undefined,
      { timeout: 30000 },
    );
    await page.evaluate(async () => {
      const services = (window as any).services;
      const course = services.courseDataService
        .getAllDepartments()
        .find((d: any) => d.abbreviation === 'CS')
        .courses.find((c: any) => c.number === '1004');
      await services.courseSelectionService.selectCourse(course);
    });
    await expect(page.locator('.degree-rail-count')).toHaveText('1');
  }

  const popup = (page: Page) => page.locator('.assign-menu-popup');

  test('closes on a click on the page', async ({ page }) => {
    await setup(page);
    await page.locator('.degree-rail-list .assign-menu-trigger').click();
    await expect(popup(page)).toBeVisible();
    await page.locator('.degree-summary-title').click();
    await expect(popup(page)).toHaveCount(0);
  });

  test('its toggle button opens and closes it', async ({ page }) => {
    await setup(page);
    const trigger = page.locator('.degree-rail-list .assign-menu-trigger');
    await trigger.click();
    await expect(popup(page)).toBeVisible();
    await trigger.click();
    await expect(popup(page)).toHaveCount(0);
  });

  test('closes on a click elsewhere inside the course finder', async ({
    page,
  }) => {
    await setup(page);
    await page.locator('#degree-course-search').click();
    await settleModal(page);
    const row = page.locator('.course-finder-row', { hasText: 'CS 1004' });
    await row.locator('.assign-menu-trigger').click();
    await expect(popup(page)).toBeVisible();

    await page.locator('#course-finder-search').click();
    await expect(popup(page)).toHaveCount(0);
    await expect(page.locator('.course-finder-modal')).toBeVisible();
  });

  test('its items still run inside the course finder', async ({ page }) => {
    await setup(page);
    await page.locator('#degree-course-search').click();
    await settleModal(page);
    const row = page.locator('.course-finder-row', { hasText: 'CS 1004' });
    await row.locator('.assign-menu-trigger').click();
    // Keyboard: the drop-up's top items can sit under the sticky header.
    await page
      .locator('.assign-menu-item', { hasText: /^Core Requirement$/ })
      .press('Enter');
    await expect(popup(page)).toHaveCount(0);
    await expect(row.locator('.course-finder-bucket-name')).toHaveText(
      'Core Requirement',
    );
  });
});
