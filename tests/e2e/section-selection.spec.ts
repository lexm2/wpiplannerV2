import { test, expect, type Page } from './fixtures';

/** courseSelectionService.setSelectedSection against real section numbers. */

test.beforeEach(async ({ page }) => {
  // Skip the first-visit welcome tutorial so it doesn't overlay the flow.
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
});

/** Select the first lecture whose number matches, by its number. */
function selectByNumber(page: Page, numberPattern: string) {
  return page.evaluate(async pattern => {
    const svc: any = (window as any).services;
    const re = new RegExp(pattern);
    for (const course of svc.courseDataService
      .getAllDepartments()
      .flatMap((d: any) => d.courses)) {
      const lecture = (course.lectures ?? [])
        .map((lg: any) => lg.section)
        .find((s: any) => re.test(s.number));
      if (!lecture) continue;
      await svc.courseSelectionService.selectCourse(course);
      const result = await svc.courseSelectionService.setSelectedSection(
        course,
        lecture.number,
      );
      const selected = svc.courseSelectionService
        .getSelectedCourses()
        .find((sc: any) => sc.course.id === course.id)?.selected.lecture;
      return {
        success: result.success,
        number: lecture.number,
        picked: selected?.number,
      };
    }
    return null;
  }, numberPattern);
}

test('a special-topics section name with a colon can be selected', async ({
  page,
}) => {
  // 273 catalog sections are named like "A01 - ST: AI in Molecular Life
  // Sciences"; the old format check rejected every one of them.
  const r = await selectByNumber(page, ':');
  expect(r).not.toBeNull();
  expect(r!.success).toBe(true);
  expect(r!.picked).toBe(r!.number);
});

test('a section number the course does not have is rejected', async ({
  page,
}) => {
  const r = await page.evaluate(async () => {
    const svc: any = (window as any).services;
    const course = svc.courseDataService.getAllDepartments()[0].courses[0];
    await svc.courseSelectionService.selectCourse(course);
    return svc.courseSelectionService.setSelectedSection(course, 'Z99');
  });
  expect(r.success).toBe(false);
  expect(r.error).toMatch(/Z99/);
});
