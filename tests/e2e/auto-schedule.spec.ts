import { test, expect, type Page } from '@playwright/test';

/**
 * Auto-schedule flows that need the real app: the filter panel's toggles, the
 * intro modal, the generating overlay and the error banner.
 */

test.beforeEach(async ({ page }) => {
  // Skip the first-visit welcome tutorial so it doesn't overlay the flow.
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
});

async function loadApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
}

/** Blocked-slot count stored on the conflict filter, or null if it is off. */
function blockedSlotCount(page: Page): Promise<number | null> {
  return page.evaluate(
    () =>
      (window as any).services.filterService.getCriteria('periodConflict')
        ?.blockedSlots?.length ?? null,
  );
}

test('calendar-events toggle reflects its state and turns off cleanly', async ({
  page,
}) => {
  await loadApp(page);
  // A recurring local event on two days, with the id format localEventService
  // gives new events.
  await page.evaluate(() => {
    const psm = (window as any).services.profileStateManager;
    const schedule = psm.getActiveSchedule();
    psm.updateSchedule(schedule.id, {
      localEvents: [
        {
          id: 'local-1760000000000-abc123def',
          title: 'Practice',
          eventType: 'recurring',
          days: ['M', 'W'],
          startTime: { hours: 15, minutes: 0 },
          endTime: { hours: 17, minutes: 0 },
          terms: ['A', 'B'],
          visible: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
  });

  await page.click('#filter-btn');
  const toggle = page.getByLabel(
    'Hide sections that conflict with calendar events (1 event)',
  );
  await expect(toggle).not.toBeChecked();

  await toggle.click();
  await expect(toggle).toBeChecked();
  expect(await blockedSlotCount(page)).toBe(4); // 2 terms x 2 days

  // A freshly rendered panel reads its state from the filter, not from the
  // checkbox's own memory of the last click.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-modal-type="filter-modal"]')).toHaveCount(0);
  await page.click('#filter-btn');
  await expect(toggle).toBeChecked();

  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect(await blockedSlotCount(page)).toBeNull();
});
