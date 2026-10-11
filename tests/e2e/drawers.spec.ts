import { test, expect, type Locator, type Page } from './fixtures';

/**
 * Side panels as drawers. Each page hides its side panels below a breakpoint
 * (the Classes sidebar and right panel at 1200px, the schedule sidebar at
 * 1024px); a header or toolbar button then slides the panel in over the page.
 * Above the breakpoints nothing changes.
 */

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
  // A phone UA gets the one-off mobile notice first.
  const notice = page.getByRole('button', { name: 'Got it' });
  if (await notice.isVisible()) await notice.click();
}

/** Select a couple of courses so the schedule sidebar has something to act on. */
async function selectCourses(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const s = (window as any).services;
    const cs = s.courseDataService
      .getAllDepartments()
      .find((d: any) => d.abbreviation === 'CS');
    for (const course of cs.courses.slice(0, 2))
      await s.courseSelectionService.selectCourse(course);
  });
}

const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });

const departments = (page: Page) => page.locator('.sidebar');
const details = (page: Page) => page.locator('[data-right-panel]');
const scheduleSidebar = (page: Page) => page.locator('.schedule-sidebar');

/** Is the panel shown on screen, as opposed to parked off-canvas? */
async function expectShown(panel: Locator): Promise<void> {
  await expect(panel).toBeVisible();
  await expect(panel).toBeInViewport({ ratio: 0.9 });
}

const focusIsWithin = (panel: Locator) =>
  panel.evaluate(el => el.contains(document.activeElement));

test.describe('at 1440x900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('no drawer buttons, panels stay inline', async ({ page }) => {
    await boot(page);
    await expect(button(page, 'Departments')).toBeHidden();
    await expect(button(page, 'Details')).toBeHidden();
    await expectShown(departments(page));
    await expectShown(details(page));
    await expect(page.locator('.side-panel-backdrop')).toHaveCount(0);

    await page.click('#schedule-tab');
    await expect(button(page, 'Courses')).toBeHidden();
    await expectShown(scheduleSidebar(page));
    // Still resizable inline.
    await expect(
      page.getByRole('separator', { name: 'Resize schedule sidebar' }),
    ).toBeVisible();
  });

  test('clicking a course opens no drawer', async ({ page }) => {
    await boot(page);
    await page.locator('[data-course-item]').first().click();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    await expect(page.locator('.side-panel-backdrop')).toHaveCount(0);
  });
});

test.describe('at 1100x800', () => {
  test.use({ viewport: { width: 1100, height: 800 } });

  test('clicking a course shows its description in a drawer', async ({
    page,
  }) => {
    await boot(page);
    await expect(details(page)).toBeHidden();
    const item = page.locator('[data-course-item]').first();
    const id = await item.getAttribute('data-course-id');
    await item.click();

    await expectShown(details(page));
    const name = await page.evaluate(
      courseId =>
        (window as any).services.courseDataService
          .getAllDepartments()
          .flatMap((d: any) => d.courses)
          .find((c: any) => c.id === courseId).name,
      id,
    );
    await expect(page.locator('#course-description')).toContainText(name);
    expect(await focusIsWithin(details(page))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(details(page)).toBeHidden();
  });

  test('the Details button opens the details drawer', async ({ page }) => {
    await boot(page);
    await button(page, 'Details').click();
    await expectShown(details(page));
    await details(page).getByRole('button', { name: 'Close Details' }).click();
    await expect(details(page)).toBeHidden();
    await expect(button(page, 'Details')).toBeFocused();
  });

  test('the Departments drawer filters the list', async ({ page }) => {
    await boot(page);
    await expect(departments(page)).toBeHidden();
    const opener = button(page, 'Departments');
    await opener.click();

    await expectShown(departments(page));
    expect(await focusIsWithin(departments(page))).toBe(true);
    await expect(page.locator('.side-panel-backdrop')).toBeVisible();

    await departments(page).locator('[data-dept-id="CS"]').click();
    await page.keyboard.press('Escape');
    await expect(departments(page)).toBeHidden();
    await expect(opener).toBeFocused();

    const codes = await page
      .locator('[data-course-item]')
      .evaluateAll(els =>
        els.slice(0, 10).map(el => el.getAttribute('data-course-id')),
      );
    expect(codes.length).toBeGreaterThan(0);
    const depts = await page.evaluate(
      ids =>
        ids.map(
          id =>
            (window as any).services.courseDataService
              .getAllDepartments()
              .flatMap((d: any) => d.courses)
              .find((c: any) => c.id === id).departmentAbbr,
        ),
      codes,
    );
    expect(new Set(depts)).toEqual(new Set(['CS']));
  });

  test('a backdrop click closes the drawer', async ({ page }) => {
    await boot(page);
    await button(page, 'Departments').click();
    await expectShown(departments(page));
    // Right of the left drawer, so on the backdrop rather than the panel.
    await page.mouse.click(1050, 400);
    await expect(departments(page)).toBeHidden();
    await expect(page.locator('.side-panel-backdrop')).toHaveCount(0);
  });

  test('a drawer closes when the window widens past its breakpoint', async ({
    page,
  }) => {
    await boot(page);
    await button(page, 'Departments').click();
    await expectShown(departments(page));
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.side-panel-backdrop')).toHaveCount(0);
    await expectShown(departments(page));
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });
});

const SCHEDULE_CASES = [
  { name: '1000x700 window', viewport: { width: 1000, height: 700 } },
  {
    name: 'phone',
    viewport: { width: 390, height: 844 },
    userAgent: IPHONE_UA,
    hasTouch: true,
  },
];

for (const { name, ...options } of SCHEDULE_CASES) {
  test.describe(`on a ${name}`, () => {
    test.use(options);

    async function openCourses(page: Page): Promise<Locator> {
      await boot(page);
      await selectCourses(page);
      await page.click('#schedule-tab');
      await expect(scheduleSidebar(page)).toBeHidden();
      const opener = button(page, 'Courses');
      await opener.click();
      await expectShown(scheduleSidebar(page));
      return opener;
    }

    test('Courses opens the schedule sidebar with its controls', async ({
      page,
    }) => {
      const opener = await openCourses(page);
      const sidebar = scheduleSidebar(page);
      expect(await focusIsWithin(sidebar)).toBe(true);
      await expect(sidebar.locator('.schedule-course-item')).toHaveCount(2);
      await expect(sidebar.locator('#clear-all-sections-btn')).toBeVisible();

      // A modal opened from the drawer: Escape closes the modal only.
      await sidebar.getByRole('button', { name: /Calendar Events/ }).click();
      const localEvent = page.locator('[data-modal-type="local-event"]');
      await expect(localEvent).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(localEvent).toHaveCount(0);
      await expectShown(sidebar);

      await sidebar
        .getByRole('button', { name: 'Filter selected courses' })
        .click();
      const filter = page.locator('[data-modal-type="filter-modal"]');
      await expect(filter).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(filter).toHaveCount(0);
      await expectShown(sidebar);

      await sidebar
        .getByRole('button', { name: 'Auto-generate schedule' })
        .click();
      const intro = page.locator('[data-modal-type="auto-schedule-intro"]');
      await expect(intro).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(intro).toHaveCount(0);
      await expectShown(sidebar);

      // Then Escape closes the drawer, and focus goes back to its opener.
      await page.keyboard.press('Escape');
      await expect(sidebar).toBeHidden();
      await expect(opener).toBeFocused();
    });

    test('the close button closes the schedule drawer', async ({ page }) => {
      const opener = await openCourses(page);
      await scheduleSidebar(page)
        .getByRole('button', { name: 'Close Courses' })
        .click();
      await expect(scheduleSidebar(page)).toBeHidden();
      await expect(opener).toBeFocused();
    });
  });
}
