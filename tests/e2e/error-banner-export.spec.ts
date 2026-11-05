import { test, expect, type Download, type Page } from './fixtures';
import { readFile } from 'node:fs/promises';

/**
 * Guards the error banner's pre-clear backup. The banner's "Clear Data &
 * Reload" is destructive and irreversible, so "Export Data" has to work in
 * exactly the situation that shows it: a boot failure caused by saved data,
 * where the Schedule Picker (the app's only other export route) may be
 * unreachable. Such a failure has no natural trigger any more (saved data is
 * validated as it loads), so the tests raise the banner the way startApp does.
 *
 * A failed catalog download is a different banner: it blames the network, and
 * offers Retry rather than a wipe.
 */

const DEGREE_RECORD = JSON.stringify({
  studentName: 'Test Student',
  programs: [],
  requirements: [],
});

// The forced failures are logged; nothing else may be.
test.use({
  expectedConsole:
    /Failed to load course data|Failed to initialize application|Invalid JSON data structure/,
});

/** The banner startApp raises when a step that reads saved data throws. */
async function raiseSavedDataFailure(
  page: Page,
  degreeRecord?: string,
): Promise<void> {
  await expect(page.locator('.app-header')).toBeVisible();
  // Stored after startup: a loaded record is validated, and this fake one is
  // only there so the second (degree) download path is exercised too.
  if (degreeRecord) {
    await page.evaluate(
      record => localStorage.setItem('wpi-planner-degree-record', record),
      degreeRecord,
    );
  }
  await page.evaluate(async () => {
    // A variable specifier: the page's dev server resolves it, not tsc.
    const module = '/wpiplannerV2/src/services/ui/uiState.svelte.ts';
    const { showAppError } = (await import(module)) as {
      showAppError: (message: string, actions: object) => void;
    };
    const schedules = (
      window as unknown as {
        services: {
          scheduleManagementService: {
            clearAllSchedules: () => Promise<void>;
            exportAllSchedules: () => Promise<{
              success: boolean;
              data?: string;
              error?: string;
            }>;
          };
        };
      }
    ).services.scheduleManagementService;
    showAppError('Failed to initialize application.', {
      onClearData: () => schedules.clearAllSchedules(),
      onExportData: () => schedules.exportAllSchedules(),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    // Skip the first-visit welcome tutorial so it doesn't overlay the banner.
    localStorage.setItem('wpi_visited', '1');
  });
});

test('exports a backup from the boot-failure banner without losing its other actions', async ({
  page,
}) => {
  const downloads: Download[] = [];
  page.on('download', d => downloads.push(d));

  await page.goto('/');
  await raiseSavedDataFailure(page, DEGREE_RECORD);

  const banner = page.locator('.error-banner');
  await expect(banner).toBeVisible();

  // Export was added, nothing was removed: all three actions still offered.
  await expect(page.locator('#error-export-data-btn')).toBeVisible();
  await expect(page.locator('#error-clear-data-btn')).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Dismiss' })).toBeVisible();

  await page.click('#error-export-data-btn');

  // One file per store the clear would destroy: schedules + degree record.
  await expect.poll(() => downloads.length).toBe(2);

  const [schedulesDl, degreeDl] = downloads;
  expect(schedulesDl.suggestedFilename()).toMatch(
    /^wpi-schedules-\d{4}-\d{2}-\d{2}\.json$/,
  );
  expect(degreeDl.suggestedFilename()).toMatch(
    /^wpi-degree-\d{4}-\d{2}-\d{2}\.json$/,
  );

  // The schedules file is the real v4 export, not an empty shell - the whole
  // point is that it can be imported back after the clear.
  const schedulesPath = await schedulesDl.path();
  const schedules = JSON.parse(await readFile(schedulesPath, 'utf-8')) as {
    v: string;
    s: unknown[];
  };
  expect(schedules.v).toMatch(/^4\./);
  expect(schedules.s.length).toBeGreaterThan(0);

  // The degree record is backed up verbatim.
  const degreePath = await degreeDl.path();
  expect(await readFile(degreePath, 'utf-8')).toBe(DEGREE_RECORD);

  // Exporting is non-destructive: the banner and its clear action survive.
  await expect(page.locator('#error-clear-data-btn')).toBeVisible();
});

test('skips the degree file when no degree record is stored', async ({
  page,
}) => {
  const downloads: Download[] = [];
  page.on('download', d => downloads.push(d));

  await page.goto('/');
  await raiseSavedDataFailure(page);
  await page.click('#error-export-data-btn');

  await expect.poll(() => downloads.length).toBe(1);
  expect(downloads[0].suggestedFilename()).toMatch(/^wpi-schedules-/);
});

test('Clear Data & Reload asks first, in the app dialog', async ({ page }) => {
  await page.goto('/');
  await raiseSavedDataFailure(page);

  await page.click('#error-clear-data-btn');
  const dialog = page.getByRole('dialog', { name: 'Clear all data' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  // Declining destroyed nothing.
  const rows = await page.evaluate(
    () =>
      (
        window as unknown as {
          services: {
            profileStateManager: { getAllSchedules(): unknown[] };
          };
        }
      ).services.profileStateManager.getAllSchedules().length,
  );
  expect(rows).toBeGreaterThan(0);
});

test.describe('catalog download failure', () => {
  test('says so, offers Retry instead of a wipe, and leaves the tabs usable', async ({
    page,
  }) => {
    let blocked = true;
    await page.route('**/course-data-constructed.json', route =>
      blocked ? route.abort() : route.continue(),
    );
    await page.goto('/');

    const banner = page.locator('.error-banner');
    await expect(banner).toContainText("Couldn't load the course catalog");
    await expect(banner).not.toContainText('saved data');
    await expect(page.locator('#error-retry-btn')).toBeVisible();
    await expect(page.locator('#error-clear-data-btn')).toHaveCount(0);

    // The banner sits below the page tabs.
    await page.getByRole('button', { name: 'Degree' }).click();
    await expect(page.getByText('Import your Academic Progress')).toBeVisible();

    blocked = false;
    await page.click('#error-retry-btn');
    await expect(banner).toBeHidden();
  });
});
