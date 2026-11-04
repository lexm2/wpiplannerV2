import { test, expect, type Page } from './fixtures';
import { fileURLToPath } from 'node:url';

/**
 * Planning ahead from the Degree page: the projection of the active schedule's
 * courses, and browsing the planner for one requirement.
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

const scheduledStat = (page: Page) =>
  page
    .locator('.degree-stat')
    .filter({ hasText: 'Scheduled' })
    .locator('.degree-stat-value');

test.use({ viewport: { width: 1280, height: 800 } });

test("the active schedule's courses project onto the summary", async ({
  page,
}) => {
  await setup(page);
  expect(Number(await scheduledStat(page).textContent())).toBeGreaterThan(0);
  await expect(page.locator('#degree-plan-note')).toContainText(
    'With 1 scheduled course',
  );
  await expect(
    page.locator('.degree-summary .degree-progress-label'),
  ).toContainText('with schedule');
});

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

test('a requirement with no course list has nothing to browse', async ({
  page,
}) => {
  await setup(page);
  // MQP, IQP and the like: no sheet rule and no departments to filter by.
  const slot = page
    .locator('[data-bucket-id*="Major Qualifying Project"] .is-static')
    .first();
  await expect(slot).toBeVisible();
  await expect(slot).toContainText('No course list');
  await expect(slot).toContainText('Course needed');
  expect(await slot.evaluate(el => el.tagName)).toBe('DIV');

  await slot.click();
  await expect(page.locator('#degree-page')).toBeVisible();
  await expect(page.locator('#planner-page')).toBeHidden();
  await expect(page.locator('.degree-filter-banner')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as any).services.filterService.hasFilter('degreeBucket'),
    ),
  ).toBe(false);
});
