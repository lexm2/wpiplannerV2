import { test, expect, type Page } from './fixtures';
import { fileURLToPath } from 'node:url';

/**
 * Planning ahead from the Degree page: browsing the planner for one
 * requirement.
 */

const fixture = fileURLToPath(
  new URL('../fixtures/academic-progress-sample.xlsx', import.meta.url),
);

/**
 * The active schedule holding CS 1004, then the Degree page with the fixture
 * imported.
 */
async function setup(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate(async () => {
    const s = (window as any).services;
    const sms = s.scheduleManagementService;
    await sms.initialize();
    const cs = s.courseDataService
      .getAllDepartments()
      .find((d: any) => d.abbreviation === 'CS').courses;
    const find = (n: string) => cs.find((c: any) => c.number === n);

    await s.courseSelectionService.selectCourse(find('1004'));
  });
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  const warning = page.locator('[data-modal-type="degree-import-warning"]');
  await warning.getByRole('button', { name: 'Got it' }).click();
  await warning.waitFor({ state: 'detached' });
}

test.use({ viewport: { width: 1280, height: 800 } });

test("a requirement's browse button filters the planner to it and says so", async ({
  page,
}) => {
  await setup(page);
  // The fixture's unmet requirement with a course list is CS's Core -
  // Workday's name for the sheet's "COMPUTER SCIENCE" bucket - so every course
  // offered is CS, minus the sheet's CS 2119 and anything already scheduled.
  const card = page.locator('[data-bucket-id*="Core Requirement"]');
  await card
    .locator('.requirement-card-browse, .requirement-course-empty')
    .locator('visible=true')
    .first()
    .click();
  await expect(page.locator('#planner-page')).toBeVisible();

  const banner = page.locator('.degree-filter-banner');
  await expect(banner).toContainText('Core Requirement');
  const cards = page.locator('#course-container [data-course-id]');
  await expect(cards.first()).toBeVisible();

  const ids = await cards.evaluateAll(els =>
    els.map(e => e.getAttribute('data-course-id') ?? ''),
  );
  expect(ids.every(id => id.startsWith('CS-'))).toBe(true);
  expect(ids.some(id => id.startsWith('CS-1004-'))).toBe(false);
  expect(ids.some(id => id.startsWith('CS-2119-'))).toBe(false);

  // Only undergraduate courses: the requirement's departments include their
  // graduate courses.
  const level = await page.evaluate(() =>
    (window as any).services.filterService.getCriteria('graduateLevel'),
  );
  expect(level).toEqual({ level: 'undergraduate' });

  // Clearing it lifts the filter: no banner.
  await page.click('#degree-filter-clear');
  await expect(banner).toHaveCount(0);
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as any).services.filterService.hasFilter(
            'degreeBucket',
          ) as boolean,
      ),
    )
    .toBe(false);
});
