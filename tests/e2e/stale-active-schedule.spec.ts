import { test, expect, type Page } from './fixtures';

/**
 * A saved active-schedule id whose schedule is gone, which reloading during
 * the first-visit tutorial leaves behind (tutorial schedules are never
 * loaded back), must not survive the load.
 */

async function load(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
}

test('a stale active schedule id falls back to a real schedule', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
  await page.goto('/');
  await load(page);
  const realId = await page.evaluate(async () => {
    const sms = (window as any).services.scheduleManagementService;
    await sms.initialize();
    return sms.getActiveScheduleId() as string;
  });
  // Let the default schedule's save land, then point the saved id at a
  // schedule that will not be loaded.
  await page.waitForTimeout(500);
  await page.evaluate(() =>
    localStorage.setItem('wpi-planner-active-schedule-id', 'tutorial_1_stale'),
  );

  await page.reload();
  await load(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).services.profileStateManager.getActiveSchedule()
            ?.id ?? null,
      ),
    )
    .toBe(realId);
  // The fixture also fails the test on the health check's warning.
});
