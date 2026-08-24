import { test, expect, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Guards the error banner's pre-clear backup. The banner's "Clear Data &
 * Reload" is destructive and irreversible, so "Export Data" has to work in
 * exactly the situation that shows it: a failed boot, where the Schedule
 * Picker (the app's only other export route) is unreachable.
 *
 * Boot failure is forced by aborting the course catalog fetch, which makes
 * courseDataService.loadCourseData() throw into AppBootstrap.startApp's catch.
 * Storage loads earlier in that sequence, so the export still has real state.
 */

const DEGREE_RECORD = JSON.stringify({
  studentName: 'Test Student',
  programs: [],
  requirements: [],
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(degreeRecord => {
    localStorage.clear();
    // Skip the first-visit welcome tutorial so it doesn't overlay the banner.
    localStorage.setItem('wpi_visited', '1');
    // Present so the second (degree) download path is exercised too.
    localStorage.setItem('wpi-planner-degree-record', degreeRecord);
  }, DEGREE_RECORD);

  await page.route('**/course-data-constructed.json', route => route.abort());
});

test('exports a backup from the boot-failure banner without losing its other actions', async ({
  page,
}) => {
  const downloads: Download[] = [];
  page.on('download', d => downloads.push(d));

  await page.goto('/');

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
  await page.addInitScript(() =>
    localStorage.removeItem('wpi-planner-degree-record'),
  );

  const downloads: Download[] = [];
  page.on('download', d => downloads.push(d));

  await page.goto('/');
  await page.click('#error-export-data-btn');

  await expect.poll(() => downloads.length).toBe(1);
  expect(downloads[0].suggestedFilename()).toMatch(/^wpi-schedules-/);
});
