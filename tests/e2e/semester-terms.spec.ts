import { test, expect, type Page } from '@playwright/test';

/** Semester (F/S) sections in the course list and the saved selection. */

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

/** A course whose every section is a fall-semester (F) section. */
async function fallOnlyCourse(page: Page) {
  return page.evaluate(() => {
    const svc: any = (window as any).services;
    const sectionsOf = (c: any) =>
      (c.lectures ?? []).flatMap((lg: any) => [
        lg.section,
        ...(lg.compatibleDiscussions ?? []),
        ...(lg.compatibleLabs ?? []),
      ]);
    const course = svc.courseDataService
      .getAllDepartments()
      .flatMap((d: any) => d.courses)
      .find((c: any) => {
        const secs = sectionsOf(c);
        return (
          secs.length > 0 && secs.every((s: any) => s.computedTerm === 'F')
        );
      });
    return {
      id: course.id as string,
      code: `${course.departmentAbbr}${course.number}`,
    };
  });
}

test('a fall-only course shows an F badge that opens its sections', async ({
  page,
}) => {
  // The list hides term badges at 1440px and below.
  await page.setViewportSize({ width: 1600, height: 900 });
  await load(page);
  const { id, code } = await fallOnlyCourse(page);
  await page.fill('#search-input', code);

  // The list and grid views both render the course; use the one on screen.
  const badge = page
    .locator(`[data-course-id="${id}"] [data-term-badge][data-term="F"]`)
    .filter({ visible: true });
  await expect(badge).toBeVisible();
  await badge.click();
  await expect(
    page
      .locator(
        `[data-course-id="${id}"] [data-term-sections][data-term="F"] [data-section-badge]`,
      )
      .filter({ visible: true }),
  ).not.toHaveCount(0);
});

test('switching to a schedule with a semester section logs no term error', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await load(page);
  const { id } = await fallOnlyCourse(page);
  await page.evaluate(async courseId => {
    const svc: any = (window as any).services;
    const departments = svc.courseDataService.getAllDepartments();
    const course = departments
      .flatMap((d: any) => d.courses)
      .find((c: any) => c.id === courseId);
    await svc.courseSelectionService.selectCourse(course);
    svc.profileStateManager.setSelectedSection(
      course,
      course.lectures[0].section.number,
    );
    // Activating a schedule re-resolves its sections against the catalog,
    // which is where a semester term used to be reported as invalid.
    svc.profileStateManager.setCourseData(departments);
    const sms = svc.scheduleManagementService;
    await sms.setActiveSchedule(sms.getActiveScheduleId());
  }, id);

  expect(errors.filter(e => e.includes('computedTerm'))).toEqual([]);
});
