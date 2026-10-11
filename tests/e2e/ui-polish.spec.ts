import { test, expect, type Page } from '@playwright/test';

/**
 * Small interaction and styling fixes across the schedule page: the wizard
 * sharing Escape with modals, the Add Event day pills, the theme dropdown,
 * Section Info's day order and the wizard footer.
 */

// Longer than the modal's MODAL_IN/MODAL_OUT transitions plus slack.
const SETTLE_MS = 400;

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

/**
 * Select a CS course whose first lecture meets on several days including
 * Monday and Friday, with that section chosen, and open the schedule page.
 * Returns the course id its blocks are drawn under.
 */
async function setupSchedule(page: Page): Promise<string> {
  await load(page);
  const id = await page.evaluate(async () => {
    const services = (window as any).services;
    const courses = services.courseDataService
      .getAllDepartments()
      .flatMap((d: any) => d.courses);
    const course = courses.find((c: any) => {
      const days = c.lectures?.[0]?.section?.periods?.[0]?.days;
      return days && days.has('M') && days.has('F') && days.size >= 3;
    });
    await services.courseSelectionService.selectCourse(course);
    await services.courseSelectionService.setSelectedSection(
      course,
      course.lectures[0].section.number,
    );
    return course.id as string;
  });
  await page.click('#schedule-tab');
  await expect(page.locator('.section-block').first()).toBeVisible();
  return id;
}

const wizard = (page: Page) =>
  page.locator('#schedule-sidebar-content.wizard-active');

async function openWizard(page: Page): Promise<void> {
  await page.locator('.schedule-course-header').first().click();
  await expect(wizard(page)).toHaveCount(1);
  await page.waitForTimeout(SETTLE_MS);
}

test('escape over the wizard closes only the filter modal', async ({
  page,
}) => {
  await setupSchedule(page);
  await openWizard(page);

  await page.click('#schedule-filter-btn');
  const modal = page.locator('[data-modal-type="filter-modal"]');
  await expect(modal).toBeVisible();
  await page.waitForTimeout(SETTLE_MS);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(SETTLE_MS);

  await expect(modal).toHaveCount(0);
  await expect(wizard(page)).toHaveCount(1);

  // With nothing over it, Escape is the wizard's again.
  await page.keyboard.press('Escape');
  await expect(wizard(page)).toHaveCount(0);
});

test('escape over the wizard closes only section info', async ({ page }) => {
  await setupSchedule(page);
  await openWizard(page);

  await page.locator('.section-block').first().click();
  const modal = page.locator('.section-info-modal');
  await expect(modal).toBeVisible();
  await page.waitForTimeout(SETTLE_MS);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(SETTLE_MS);

  await expect(modal).toHaveCount(0);
  await expect(wizard(page)).toHaveCount(1);
});

test('section info lists meeting days in week order', async ({ page }) => {
  const id = await setupSchedule(page);
  const expected = await page.evaluate(courseId => {
    const services = (window as any).services;
    const course = services.courseDataService
      .getAllDepartments()
      .flatMap((d: any) => d.courses)
      .find((c: any) => c.id === courseId);
    const days: Set<string> = course.lectures[0].section.periods[0].days;
    return ['M', 'T', 'W', 'R', 'F'].filter(d => days.has(d)).join(', ');
  }, id);

  await page.locator(`.section-block[data-course-id="${id}"]`).first().click();
  await expect(page.locator('.section-period-schedule').first()).toHaveText(
    new RegExp(`^${expected}\\s`),
  );
});
