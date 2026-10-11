import { test, expect, type Page } from './fixtures';

/** The conflict filter's semester-spans-quarters toggle in the filter panel. */

const AVOID = '#avoid-conflicts-filter';
const SPANS = '#semester-spans-filter';

test.beforeEach(async ({ page }) => {
  // Skip the first-visit welcome tutorial so it doesn't overlay the flow.
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
});

async function openFilters(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
  await page.click('#filter-btn');
}

const spansCriteria = (page: Page) =>
  page.evaluate(
    () =>
      (window as any).services.filterService.getCriteria('periodConflict')
        ?.semesterSpansQuarters,
  );

test('semester toggle appears with conflict checking, on by default', async ({
  page,
}) => {
  await openFilters(page);
  await expect(page.locator(SPANS)).toHaveCount(0);

  await page.locator(AVOID).check();
  await expect(page.locator(SPANS)).toBeChecked();
  expect(await spansCriteria(page)).not.toBe(false);
});

test('turning the semester toggle off switches to exact-term conflicts', async ({
  page,
}) => {
  await openFilters(page);
  await page.locator(AVOID).check();

  await page.locator(SPANS).uncheck();
  expect(await spansCriteria(page)).toBe(false);

  // A selection change rewrites the criteria; the choice has to survive it.
  await page.evaluate(async () => {
    const svc: any = (window as any).services;
    const course = svc.courseDataService.getAllDepartments()[0].courses[0];
    await svc.courseSelectionService.selectCourse(course);
  });
  await expect.poll(() => spansCriteria(page)).toBe(false);
  await expect(page.locator(SPANS)).not.toBeChecked();

  await page.locator(SPANS).check();
  expect(await spansCriteria(page)).toBe(true);
});
