import { test, expect, type Page } from '@playwright/test';

/**
 * The schedule sidebar's answer to "which course is this block?".
 *
 * Hovering a section block highlights that course's sidebar item - and the
 * sidebar lists every selected course while a grid shows one term, so the item
 * being highlighted is routinely scrolled out of the panel. The reveal is what
 * makes the highlight worth drawing.
 */

test.beforeEach(async ({ page }) => {
  // Skip the first-visit welcome tutorial so it doesn't overlay the flow.
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
});

/**
 * Fill the sidebar past its own height, every course carrying a section so it
 * draws blocks on the grid to hover.
 */
async function setupCrowdedSidebar(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate(async () => {
    const services = (window as any).services;
    const cs = services.courseDataService
      .getAllDepartments()
      .find((d: any) => d.abbreviation === 'CS');
    for (const course of cs.courses.slice(0, 12)) {
      await services.courseSelectionService.selectCourse(course);
      const section = course.lectures?.[0]?.section;
      if (section)
        await services.courseSelectionService.setSelectedSection(
          course,
          section.number,
        );
    }
  });
  await page.click('#schedule-tab');
  await expect(page.locator('.section-block').first()).toBeVisible();
}

const scrollTop = (page: Page): Promise<number> =>
  page.locator('#schedule-sidebar-content').evaluate(el => el.scrollTop);

/**
 * The last selected course that also draws a block - the one furthest down a
 * list the panel cannot show all of, which is the case the reveal exists for.
 */
async function offscreenCourseWithBlock(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const drawn = new Set(
      [...document.querySelectorAll('.section-block')].map(el =>
        el.getAttribute('data-course-id'),
      ),
    );
    const box = document
      .querySelector('#schedule-sidebar-content')!
      .getBoundingClientRect();
    return (
      [...document.querySelectorAll('.schedule-course-item')]
        .filter(el => drawn.has(el.getAttribute('data-course-id')))
        .filter(el => el.getBoundingClientRect().top > box.bottom)
        .pop()
        ?.getAttribute('data-course-id') ?? null
    );
  });
  expect(id, 'no selected course sits below the sidebar fold').not.toBeNull();
  return id!;
}

test('reveals the hovered course in the schedule sidebar', async ({ page }) => {
  await setupCrowdedSidebar(page);

  const courseId = await offscreenCourseWithBlock(page);
  const item = page.locator(
    `.schedule-course-item[data-course-id="${courseId}"]`,
  );
  await expect(item).not.toBeInViewport();

  await page
    .locator(`.section-block[data-course-id="${courseId}"]`)
    .first()
    .hover();

  await expect(item).toHaveClass(/sidebar-course-highlighted/);
  await expect(item).toBeInViewport({ ratio: 1 });
});

/**
 * Only when it has to: a hover on a course already on screen must not shunt the
 * list around under the reader, which is the whole reason the reveal asks for
 * `block: 'nearest'` rather than centring what it names.
 */
test('leaves the sidebar alone when the hovered course is already visible', async ({
  page,
}) => {
  await setupCrowdedSidebar(page);

  const courseId = await page.evaluate(() =>
    document
      .querySelector('.schedule-course-item')!
      .getAttribute('data-course-id')!,
  );

  const before = await scrollTop(page);
  await page
    .locator(`.section-block[data-course-id="${courseId}"]`)
    .first()
    .hover();

  await expect(
    page.locator(`.schedule-course-item[data-course-id="${courseId}"]`),
  ).toHaveClass(/sidebar-course-highlighted/);
  // Asserting that nothing moved needs a window for it to move in: the reveal
  // scrolls smoothly, so an immediate read would pass on a list mid-flight.
  await page.waitForTimeout(600);
  expect(await scrollTop(page)).toBe(before);
});

/**
 * The wizard panel sits at the top of this same scroller and wizardScrollLock
 * pins it there. A reveal firing behind it would scroll the panel off screen -
 * with the overflow lock on, leaving no way back to the wizard.
 */
test('holds the sidebar still while the wizard owns it', async ({ page }) => {
  await setupCrowdedSidebar(page);
  const courseId = await offscreenCourseWithBlock(page);

  await page.locator('.schedule-course-header').first().click();
  await expect(
    page.locator('#schedule-sidebar-content.wizard-active'),
  ).toHaveCount(1);
  expect(await scrollTop(page)).toBe(0);

  await page
    .locator(`.section-block[data-course-id="${courseId}"]`)
    .first()
    .hover();

  await expect(
    page.locator(`.schedule-course-item[data-course-id="${courseId}"]`),
  ).toHaveClass(/sidebar-course-highlighted/);
  await page.waitForTimeout(600);
  expect(await scrollTop(page)).toBe(0);
});
