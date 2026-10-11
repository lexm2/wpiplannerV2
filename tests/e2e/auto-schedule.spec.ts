import { test, expect, type Page } from '@playwright/test';

/**
 * Auto-schedule flows that need the real app: the filter panel's toggles, the
 * intro modal, the generating overlay and the error banner.
 */

test.beforeEach(async ({ page }) => {
  // Skip the first-visit welcome tutorial so it doesn't overlay the flow.
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
});

async function loadApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
}

/** Blocked-slot count stored on the conflict filter, or null if it is off. */
function blockedSlotCount(page: Page): Promise<number | null> {
  return page.evaluate(
    () =>
      (window as any).services.filterService.getCriteria('periodConflict')
        ?.blockedSlots?.length ?? null,
  );
}

test('calendar-events toggle reflects its state and turns off cleanly', async ({
  page,
}) => {
  await loadApp(page);
  // A recurring local event on two days, with the id format localEventService
  // gives new events.
  await page.evaluate(() => {
    const psm = (window as any).services.profileStateManager;
    const schedule = psm.getActiveSchedule();
    psm.updateSchedule(schedule.id, {
      localEvents: [
        {
          id: 'local-1760000000000-abc123def',
          title: 'Practice',
          eventType: 'recurring',
          days: ['M', 'W'],
          startTime: { hours: 15, minutes: 0 },
          endTime: { hours: 17, minutes: 0 },
          terms: ['A', 'B'],
          visible: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
  });

  await page.click('#filter-btn');
  const toggle = page.getByLabel(
    'Hide sections that conflict with calendar events (1 event)',
  );
  await expect(toggle).not.toBeChecked();

  await toggle.click();
  await expect(toggle).toBeChecked();
  expect(await blockedSlotCount(page)).toBe(4); // 2 terms x 2 days

  // A freshly rendered panel reads its state from the filter, not from the
  // checkbox's own memory of the last click.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-modal-type="filter-modal"]')).toHaveCount(0);
  await page.click('#filter-btn');
  await expect(toggle).toBeChecked();

  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect(await blockedSlotCount(page)).toBeNull();
});

test('"avoid conflicts" follows the selection made after it was switched on', async ({
  page,
}) => {
  await loadApp(page);
  await page.click('#filter-btn');
  await page.check('#avoid-conflicts-filter');
  await page.keyboard.press('Escape');

  const picked = await page.evaluate(async () => {
    const services = (window as any).services;
    const course = services.courseDataService
      .getAllDepartments()
      .find((d: any) => d.abbreviation === 'CS')
      .courses.find((c: any) => c.lectures?.length);
    await services.courseSelectionService.selectCourse(course);
    await services.courseSelectionService.setSelectedSection(
      course,
      course.lectures[0].section.number,
    );
    return course.id;
  });

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).services.filterService
            .getCriteria('periodConflict')
            ?.selectedCourses?.map((sc: any) => sc.course.id) ?? [],
      ),
    )
    .toEqual([picked]);
});

/** Selects courses by code (no sections picked) and opens the schedule page. */
async function selectCourses(page: Page, codes: string[]): Promise<void> {
  await page.evaluate(async codes => {
    const services = (window as any).services;
    const all = services.courseDataService
      .getAllDepartments()
      .flatMap((d: any) => d.courses);
    for (const code of codes) {
      const course = all.find(
        (c: any) => `${c.departmentAbbr}${c.number}` === code,
      );
      if (!course) throw new Error(`No course ${code} in the catalog`);
      await services.courseSelectionService.selectCourse(course);
    }
  }, codes);
  await page.click('#schedule-tab');
}

/** Intro -> filter modal -> Generate, then wait for the overlay to clear. */
async function generateFromIntro(page: Page): Promise<void> {
  await page.click(
    '[data-modal-type="auto-schedule-intro"] [data-action="next"]',
  );
  await page.click('#modal-primary-btn');
  await expect(page.locator('.schedule-generating-overlay')).toHaveCount(0, {
    timeout: 60_000,
  });
}

const COURSES = ['CS2102', 'MA1022', 'PH1110', 'CH1010'];

test('Restart with the intro defaults regenerates every course', async ({
  page,
}) => {
  await loadApp(page);
  await selectCourses(page, COURSES);

  await page.click('#auto-schedule-btn');
  await generateFromIntro(page);
  await expect(page.locator('.error-banner')).toHaveCount(0);

  await page.getByRole('button', { name: 'Restart auto-schedule' }).click();
  await generateFromIntro(page);

  await expect(page.locator('.error-banner')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Restart auto-schedule' }),
  ).toBeVisible();
});

test('no generated option overlaps the courses locked in the intro', async ({
  page,
}) => {
  await loadApp(page);
  await selectCourses(page, COURSES);
  await page.click('#auto-schedule-btn');
  await generateFromIntro(page);

  // Lock everything but MA1022 to the sections just generated.
  await page.getByRole('button', { name: 'Restart auto-schedule' }).click();
  const intro = page.locator('[data-modal-type="auto-schedule-intro"]');
  for (const code of ['CS2102', 'PH1110', 'CH1010']) {
    await intro
      .locator('.as-course-card', {
        has: page.locator('.as-course-code', { hasText: code }),
      })
      .click();
  }
  await generateFromIntro(page);
  await expect(page.locator('.error-banner')).toHaveCount(0);

  const overlaps = await page.evaluate(() => {
    const quarters = (t: string): string[] =>
      t === 'F' ? ['A', 'B'] : t === 'S' ? ['C', 'D'] : [t];
    const minutes = (t: any): number => t.hours * 60 + t.minutes;
    const sectionsOf = (combo: any): any[] =>
      ['lecture', 'discussion', 'lab'].map(k => combo[k]).filter(Boolean);
    const clash = (a: any, b: any): boolean =>
      quarters(a.computedTerm).some(q =>
        quarters(b.computedTerm).includes(q),
      ) &&
      a.periods.some((p: any) =>
        b.periods.some(
          (r: any) =>
            !p.isAsync &&
            !r.isAsync &&
            [...p.days].some((d: string) => r.days.has(d)) &&
            minutes(p.startTime) < minutes(r.endTime) &&
            minutes(r.startTime) < minutes(p.endTime),
        ),
      );

    const services = (window as any).services;
    const locked = services.courseSelectionService
      .getSelectedCourses()
      .filter(
        (sc: any) =>
          `${sc.course.departmentAbbr}${sc.course.number}` !== 'MA1022',
      )
      .flatMap((sc: any) => sectionsOf(sc.selected));
    const options = services.autoScheduleOrchestrator.getGeneratedSchedules();
    const found: string[] = [];
    options.forEach((option: any[], i: number) => {
      for (const result of option) {
        for (const s of sectionsOf(result.combination)) {
          for (const l of locked.filter((l: any) => clash(s, l))) {
            found.push(`option ${i}: ${s.number} vs ${l.number}`);
          }
        }
      }
    });
    return { count: options.length, found };
  });
  expect(overlaps.count).toBeGreaterThan(0);
  expect(overlaps.found).toEqual([]);
});

test('a course with no usable section is named, on separate banner lines', async ({
  page,
}) => {
  await loadApp(page);
  await selectCourses(page, ['CS2102']);
  // A term no section is offered in leaves CS2102 with nothing to pick.
  await page.evaluate(() =>
    (window as any).services.filterService.addFilter('term', { terms: ['Z'] }),
  );

  await page.click('#auto-schedule-btn');
  await generateFromIntro(page);

  const message = page.locator('.error-banner-text p').first();
  await expect(message).toContainText('CS2102');
  // innerText keeps the line breaks only if they are rendered.
  const text = await message.evaluate(el => (el as HTMLElement).innerText);
  expect(text).toMatch(/\n• /);
});

test('the Auto-Schedule button is disabled while generating', async ({
  page,
}) => {
  // Hold each job back so the generating state lasts long enough to see.
  await page.addInitScript(() => {
    const RealWorker = window.Worker;
    window.Worker = class extends RealWorker {
      postMessage(message: unknown): void {
        setTimeout(() => super.postMessage(message), 1500);
      }
    };
  });
  await loadApp(page);
  await selectCourses(page, COURSES);

  const button = page.locator('#auto-schedule-btn');
  await button.click();
  await page.click(
    '[data-modal-type="auto-schedule-intro"] [data-action="next"]',
  );
  await page.click('#modal-primary-btn');

  await expect(page.locator('.schedule-generating-overlay')).toBeVisible();
  await expect(button).toBeDisabled();

  await expect(page.locator('.schedule-generating-overlay')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Restart auto-schedule' }),
  ).toBeEnabled();
});

test('the intro offers a semester-only course its F term', async ({ page }) => {
  await loadApp(page);
  await selectCourses(page, ['AE601']);
  await page.click('#auto-schedule-btn');

  const card = page
    .locator('[data-modal-type="auto-schedule-intro"] .as-course-card')
    .filter({ has: page.locator('.as-course-code', { hasText: 'AE601' }) });
  const fall = card.locator('[data-term-badge][data-term="F"]');
  await expect(fall).toHaveCount(1);
  await expect(fall).not.toHaveClass(/unavailable/);
  await expect(fall).toHaveClass(/selected/);

  // Its only term: deselecting it leaves the course out.
  await fall.click();
  await expect(fall).not.toHaveClass(/selected/);
  await expect(card).not.toHaveClass(/(^|\s)selected(\s|$)/);
});
