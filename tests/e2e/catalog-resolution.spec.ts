import { test, expect, type Page } from '@playwright/test';

/** A saved selection is re-pointed at the live catalog once it loads. */

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

test('a reloaded selection uses the live catalog objects', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', m => {
    if (m.type() === 'warning') warnings.push(m.text());
  });

  await load(page);
  const courseId = await page.evaluate(async () => {
    const svc: any = (window as any).services;
    const course = svc.courseDataService.getAllDepartments()[0].courses[0];
    await svc.courseSelectionService.selectCourse(course);
    svc.profileStateManager.setSelectedSection(
      course,
      course.lectures[0].section.number,
    );
    return course.id as string;
  });
  // Let the save land before reloading.
  await page.waitForTimeout(500);
  warnings.length = 0;

  await page.reload();
  await load(page);
  await expect
    .poll(() =>
      page.evaluate(id => {
        const svc: any = (window as any).services;
        const live = svc.courseDataService
          .getAllDepartments()
          .flatMap((d: any) => d.courses)
          .find((c: any) => c.id === id);
        const sc = svc.courseSelectionService
          .getSelectedCourses()
          .find((s: any) => s.course.id === id);
        return {
          course: sc?.course === live,
          section: sc?.selected.lecture === live.lectures[0].section,
        };
      }, courseId),
    )
    .toEqual({ course: true, section: true });

  expect(warnings.filter(w => w.includes('catalog'))).toEqual([]);
});
