import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
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

function addCourse(page: any, code: string) {
  return page.evaluate(async (code: string) => {
    const svc: any = (window as any).services;
    const course = svc.courseDataService
      .getAllDepartments()
      .flatMap((d: any) => d.courses)
      .find((c: any) => c.departmentAbbr + c.number === code);
    await svc.courseSelectionService.selectCourse(course);
    return course.id;
  }, code);
}

test('wizard names its course, shows every meeting, and manages focus', async ({
  page,
}) => {
  await addCourse(page, 'ML4011');
  await page.getByRole('button', { name: 'Schedule view' }).click();
  await expect(
    page.locator('#schedule-sidebar-content .incomplete-warning'),
  ).toContainText('Pick sections');

  const card = page.locator('.schedule-course-header', { hasText: 'ML4011' });
  await card.focus();
  await page.keyboard.press('Enter');
  const panel = page
    .getByRole('region')
    .filter({ has: page.locator('[data-crn]') });
  await expect(panel.getByRole('heading', { level: 2 })).toContainText(
    'Leadership And Management I',
  );
  await expect(panel.getByRole('heading', { level: 2 })).toBeFocused();
  await expect(page.locator('.schedule-course-list')).toHaveAttribute(
    'inert',
    '',
  );

  // A double-click on Next advances exactly one step.
  await page.locator('[data-crn]').first().click();
  await page.locator('#wizard-next-btn').dblclick();
  await expect(
    page.locator('[data-step="discussion"]:not(button)'),
  ).toHaveCount(1);
  await expect(page.locator('[data-crn]', { hasText: 'AD01' })).toContainText(
    'TWR 6:00 AM - 7:30 AM',
  );

  await page.keyboard.press('Control+z');
  await expect(page.locator('#undo-btn')).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(card).toBeFocused();
});

test('Escape closes the wizard before zooming a focused term back out', async ({
  page,
}) => {
  await addCourse(page, 'ML4011');
  await page.getByRole('button', { name: 'Schedule view' }).click();
  await page.getByRole('button', { name: 'Zoom to A term' }).click();
  const grid = page.locator('[data-focused-term="A"]');
  await expect(grid).toHaveCount(1);

  await page.locator('.schedule-course-header', { hasText: 'ML4011' }).click();
  await expect(page.locator('[data-crn]').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-crn]')).toHaveCount(0);
  await expect(grid).toHaveCount(1);

  // The zoom ignores keys until its own animation has finished.
  await expect(async () => {
    await page.keyboard.press('Escape');
    await expect(grid).toHaveCount(0, { timeout: 500 });
  }).toPass();
});

test('removing the course closes the wizard', async ({ page }) => {
  const id = await addCourse(page, 'PH1120');
  await page.getByRole('button', { name: 'Schedule view' }).click();
  await page.locator('.schedule-course-header').first().click();
  await expect(page.locator('[data-crn]').first()).toBeVisible();
  await page.evaluate(async (id: string) => {
    const svc: any = (window as any).services;
    const c = svc.courseSelectionService
      .getSelectedCourses()
      .find((s: any) => s.course.id === id).course;
    await svc.courseSelectionService.unselectCourse(c);
  }, id);
  await expect(page.locator('[data-crn]')).toHaveCount(0);
});

test('adding a course from another year offers a schedule of that year', async ({
  page,
}) => {
  await page.evaluate(() => {
    const svc: any = (window as any).services;
    const c = svc.courseDataService
      .getAllDepartments()
      .flatMap((d: any) => d.courses)
      .find((c: any) => c.academicYear === 2027);
    void svc.courseSelectionService.toggleCourseSelection(c);
  });
  await page.getByRole('button', { name: /Create 2027-28 schedule/ }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = (
          window as any
        ).services.profileStateManager.getActiveSchedule();
        return [a.year, a.selectedCourses.length];
      }),
    )
    .toEqual([2027, 1]);
});

test('Change Sections opens on the current picks and keeps them', async ({
  page,
}) => {
  await addCourse(page, 'PH1120');
  await page.getByRole('button', { name: 'Schedule view' }).click();
  const header = page.locator('.schedule-course-header').first();
  await header.click();
  const first = page.locator('[data-crn]').first();
  const crn = await first.getAttribute('data-crn');
  await first.click();
  await page.locator('#wizard-next-btn').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-crn]')).toHaveCount(0);

  const picked = () =>
    page.evaluate(
      () =>
        (window as any).services.courseSelectionService.getSelectedCourses()[0]
          .selected.lecture?.crn,
    );
  // Cancel keeps nothing; commit one lecture first.
  expect(await picked()).toBeUndefined();
  await header.click();
  await page.locator(`[data-crn="${crn}"]`).click();
  const footer = page.getByRole('button', { name: /^(Skip|Next|Finish)$/ });
  for (let i = 0; i < 4; i++) {
    const label = await footer.textContent();
    await footer.click();
    if (label?.trim() === 'Finish') break;
  }
  await page.getByRole('button', { name: 'Finish anyway' }).click();
  await expect.poll(picked).toBe(Number(crn));

  await header.click();
  await expect(page.locator(`[data-crn="${crn}"]`)).toHaveClass(/selected/);
});
