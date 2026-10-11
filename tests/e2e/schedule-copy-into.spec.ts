import { test, expect, type Page } from '@playwright/test';

/**
 * "Copy Into" in the schedule picker: pick a source schedule, then click the
 * schedule to merge its courses into.
 */

const PICKER = '[data-modal-type="schedule-picker"]';

test.beforeEach(async ({ page }) => {
  // Skip the first-visit welcome tutorial so it doesn't overlay the flow.
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
});

/**
 * Two schedules sharing one course: "First" (active) holds courses 0 and 1,
 * "Second" holds 1 and 2. Returns the ids involved.
 */
async function seed(page: Page) {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );

  return page.evaluate(async () => {
    const svc: any = (window as any).services;
    const sms = svc.scheduleManagementService;
    const sel = svc.courseSelectionService;
    await sms.initialize();

    const courses = svc.courseDataService
      .getAllDepartments()
      .flatMap((d: any) => d.courses)
      .slice(0, 3);

    const firstId = sms.getActiveScheduleId();
    await sms.renameSchedule(firstId, 'First');
    await sel.selectCourse(courses[0]);
    await sel.selectCourse(courses[1]);

    const created = await sms.createNewSchedule('Second');
    const secondId = created.schedule.id;
    await sel.selectCourse(courses[1]);
    await sel.selectCourse(courses[2]);

    await sms.setActiveSchedule(firstId);
    return {
      firstId,
      secondId,
      courseIds: courses.map((c: any) => c.id) as string[],
    };
  });
}

async function courseIdsOf(page: Page, scheduleId: string) {
  return page.evaluate(id => {
    const sms = (window as any).services.scheduleManagementService;
    return sms
      .getScheduleById(id)
      .selectedCourses.map((sc: any) => sc.course.id)
      .sort();
  }, scheduleId);
}

const row = (page: Page, id: string) =>
  page.locator(`${PICKER} .schedule-item[data-schedule-id="${id}"]`);

test('copies one schedule into another without duplicating shared courses', async ({
  page,
}) => {
  const { firstId, secondId, courseIds } = await seed(page);

  await page.click('#schedule-picker-btn');
  await row(page, secondId).getByRole('button', { name: 'Copy Into' }).click();

  const banner = page.locator(`${PICKER} .schedule-copy-banner`);
  await expect(banner).toContainText('Second');
  await expect(row(page, firstId)).toContainText('Copy here');

  await row(page, firstId).click();
  await expect(banner).toBeHidden();
  await expect(row(page, firstId)).toContainText('3 courses');

  expect(await courseIdsOf(page, firstId)).toEqual([...courseIds].sort());
  // The source is left as it was.
  expect(await courseIdsOf(page, secondId)).toEqual(
    [courseIds[1], courseIds[2]].sort(),
  );

  // First is the active schedule, so the live selection picks up the copy.
  const live = await page.evaluate(() =>
    (window as any).services.courseSelectionService
      .getSelectedCourses()
      .map((sc: any) => sc.course.id)
      .sort(),
  );
  expect(live).toEqual([...courseIds].sort());
});

test('cancel leaves copy mode without copying or switching', async ({
  page,
}) => {
  const { firstId, secondId, courseIds } = await seed(page);

  await page.click('#schedule-picker-btn');
  await row(page, firstId).getByRole('button', { name: 'Copy Into' }).click();

  // Clicking the source itself does nothing.
  await row(page, firstId).click();
  const banner = page.locator(`${PICKER} .schedule-copy-banner`);
  await expect(banner).toBeVisible();

  await banner.getByRole('button', { name: 'Cancel' }).click();
  await expect(banner).toBeHidden();

  expect(await courseIdsOf(page, secondId)).toEqual(
    [courseIds[1], courseIds[2]].sort(),
  );
  const active = await page.evaluate(() =>
    (window as any).services.scheduleManagementService.getActiveScheduleId(),
  );
  expect(active).toBe(firstId);
});
