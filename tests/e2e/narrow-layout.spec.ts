import { test, expect, type Page } from '@playwright/test';

/**
 * Narrow windows and phones. Below 1250px the header collapses everything but
 * the settings gear, and below 1024px the schedule sidebar is hidden, so the
 * controls that remain have to stay reachable.
 *
 * Firefox has no `isMobile`, so a phone is a 390x844 touch viewport with an
 * iPhone user agent - which is what flips `html.is-mobile` on.
 */

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PHONE = { width: 390, height: 844 };

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
  // A phone UA gets the one-off "Mobile Not Supported" notice first.
  const notice = page.getByRole('button', { name: 'Got it' });
  if (await notice.isVisible()) await notice.click();
}

/** The element a tap at the centre of `selector` would actually land on. */
async function hitTargetAtCentre(page: Page, selector: string) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel)!;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    return {
      ok: !!hit && (hit === el || el.contains(hit)),
      hit: hit ? `${hit.tagName}#${hit.id}.${hit.className}` : null,
    };
  }, selector);
}

for (const device of ['phone UA', 'desktop UA'] as const) {
  test.describe(`at 390x844 with a ${device}`, () => {
    test.use({
      viewport: PHONE,
      hasTouch: device === 'phone UA',
      ...(device === 'phone UA' ? { userAgent: IPHONE_UA } : {}),
    });

    test('the settings gear is the hit target and opens its menu', async ({
      page,
    }) => {
      await boot(page);
      expect(
        await page.evaluate(() =>
          document.documentElement.classList.contains('is-mobile'),
        ),
      ).toBe(device === 'phone UA');

      const gear = page.locator('.settings-menu-btn');
      await expect(gear).toBeVisible();
      const gearHit = await hitTargetAtCentre(page, '.settings-menu-btn');
      expect(gearHit.ok, `gear covered by ${gearHit.hit}`).toBe(true);

      // No force: Playwright refuses the click if another element is on top.
      await gear.click({ timeout: 5000 });
      await expect(page.locator('.settings-dropdown-menu')).toBeVisible();

      // Every page tab must stay tappable too.
      for (const tab of ['#planner-tab', '#schedule-tab', '#degree-tab']) {
        const tabHit = await hitTargetAtCentre(page, tab);
        expect(tabHit.ok, `${tab} covered by ${tabHit.hit}`).toBe(true);
      }
    });
  });
}

/**
 * Select a lecture-only course with at least two lectures in one term, on its
 * first lecture, and open the Schedule page. Returns the course id and the
 * crn of a different lecture to switch to.
 */
async function scheduleOneCourse(
  page: Page,
): Promise<{ id: string; otherCrn: string }> {
  const picked = await page.evaluate(async () => {
    const s = (window as any).services;
    const course = s.courseDataService
      .getAllDepartments()
      .flatMap((d: any) => d.courses)
      .find(
        (c: any) =>
          (c.lectures?.length ?? 0) >= 2 &&
          !c.standaloneLabs?.length &&
          c.lectures.every(
            (l: any) =>
              !l.compatibleDiscussions.length && !l.compatibleLabs.length,
          ) &&
          c.lectures[1].section.computedTerm ===
            c.lectures[0].section.computedTerm,
      );
    await s.courseSelectionService.selectCourse(course);
    await s.courseSelectionService.setSelectedSection(
      course,
      course.lectures[0].section.number,
    );
    return {
      id: course.id as string,
      otherCrn: String(course.lectures[1].section.crn),
    };
  });
  await page.click('#schedule-tab');
  return picked;
}

const selectedLectureCrn = (page: Page, id: string) =>
  page.evaluate(
    courseId =>
      String(
        (window as any).services.courseSelectionService
          .getSelectedCourses()
          .find((sc: any) => sc.course.id === courseId)?.selected.lecture?.crn,
      ),
    id,
  );

const WIZARD_CASES = [
  { name: '1000x700 window', viewport: { width: 1000, height: 700 } },
  { name: 'phone', viewport: PHONE, userAgent: IPHONE_UA, hasTouch: true },
];

for (const { name, ...options } of WIZARD_CASES) {
  test.describe(`on a ${name}`, () => {
    test.use(options);

    async function openChangeSections(page: Page, id: string) {
      await page
        .locator(`.section-block[data-course-id="${id}"]`)
        .first()
        .click();
      await page.getByRole('button', { name: 'Change Sections' }).click();
    }

    test('Change Sections opens a usable wizard', async ({ page }) => {
      await boot(page);
      const { id, otherCrn } = await scheduleOneCourse(page);
      await openChangeSections(page, id);

      const card = page.locator(`[data-crn="${otherCrn}"]`);
      await expect(card).toBeVisible({ timeout: 5000 });
      await card.click({ timeout: 5000 });
      await page.locator('#wizard-next-btn').click({ timeout: 5000 });

      await expect(card).toBeHidden();
      expect(await selectedLectureCrn(page, id)).toBe(otherCrn);
    });

    test('cancelling the wizard puts the narrow layout back', async ({
      page,
    }) => {
      await boot(page);
      const { id } = await scheduleOneCourse(page);
      await openChangeSections(page, id);

      await page
        .locator('.sidebar-panel')
        .getByRole('button', { name: 'Cancel', exact: true })
        .click({ timeout: 5000 });

      await expect(page.locator('.schedule-sidebar')).toBeHidden();
      const grid = await hitTargetAtCentre(page, '.schedule-main');
      expect(grid.ok, `grid covered by ${grid.hit}`).toBe(true);
    });

    // The wizard's drawer is the schedule sidebar's drawer, so dismissing it
    // must take the wizard with it rather than leave it open out of sight.
    test('Escape closes the wizard and its drawer together', async ({
      page,
    }) => {
      await boot(page);
      const { id } = await scheduleOneCourse(page);
      await openChangeSections(page, id);
      await expect(page.locator('.sidebar-panel')).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(page.locator('.schedule-sidebar')).toBeHidden();
      expect(
        await page.evaluate(
          () => document.querySelector('.sidebar-panel') === null,
        ),
      ).toBe(true);
      const grid = await hitTargetAtCentre(page, '.schedule-main');
      expect(grid.ok, `grid covered by ${grid.hit}`).toBe(true);
    });
  });
}

/**
 * The right panel defaults to 700px, which on a 1280px laptop left the course
 * list ~270px wide: names cut to "El…" and no List/Grid toggle. The default
 * has to give way to the list there, while a dragged width still wins.
 */
test.describe('Classes page at 1280x720', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  const widths = (page: Page) =>
    page.evaluate(() => {
      const w = (sel: string) =>
        Math.round(document.querySelector(sel)!.getBoundingClientRect().width);
      return { list: w('.main-content'), panel: w('[data-right-panel]') };
    });

  test('the course list keeps a usable width by default', async ({ page }) => {
    await boot(page);
    const { list, panel } = await widths(page);
    expect(list, `list ${list}px beside a ${panel}px panel`).toBeGreaterThan(
      500,
    );
    expect(panel).toBeGreaterThanOrEqual(360);
    await expect(page.locator('#view-grid')).toBeVisible();

    // The course name is not cut down to a couple of letters.
    const name = page.locator('[data-course-item]').first().getByText(/\w{6}/);
    await expect(name.first()).toBeVisible();
  });

  test('a stored drag width still wins', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('wpi-planner-width-right-panel', '640'),
    );
    await boot(page);
    expect((await widths(page)).panel).toBe(640);
  });

  test('double-click reset returns to the adaptive default', async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem('wpi-planner-width-right-panel', '640'),
    );
    await boot(page);
    await page.locator('[data-right-panel] .resize-handle').dblclick();
    expect((await widths(page)).list).toBeGreaterThan(500);
  });
});
