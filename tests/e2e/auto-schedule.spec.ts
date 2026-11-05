import { test, expect, type Page, type Locator } from './fixtures';

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

/** The conflict filter's stored criteria, or undefined if it is off. */
function conflictCriteria(page: Page): Promise<any> {
  return page.evaluate(() =>
    (window as any).services.filterService.getCriteria('periodConflict'),
  );
}

/** Replaces the active schedule's calendar events the way the app does. */
function setEvents(page: Page, events: unknown[]): Promise<void> {
  return page.evaluate(events => {
    const psm = (window as any).services.profileStateManager;
    psm.updateSchedule(
      psm.getActiveSchedule().id,
      { localEvents: events },
      'calendar-event',
    );
  }, events);
}

function weeklyEvent(
  id: string,
  title: string,
  days: string[],
  start: number,
  end: number,
  terms = ['A', 'B', 'C', 'D'],
) {
  return {
    id: `local-${id}`,
    title,
    eventType: 'recurring',
    days,
    startTime: { hours: start, minutes: 0 },
    endTime: { hours: end, minutes: 0 },
    terms,
    visible: true,
    createdAt: 1,
    updatedAt: 1,
  };
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
  await page.click('#more-filters-toggle');
  const toggle = page.getByLabel(
    'Hide sections that conflict with calendar events (1 event)',
  );
  await expect(toggle).not.toBeChecked();

  await toggle.click();
  await expect(toggle).toBeChecked();
  // The events are read live: no copy of their slots goes into the filter.
  expect(await conflictCriteria(page)).toMatchObject({
    avoidCalendarEvents: true,
    blockedSlots: [],
  });

  // A freshly rendered panel reads its state from the filter, not from the
  // checkbox's own memory of the last click.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-modal-type="filter-modal"]')).toHaveCount(0);
  await page.click('#filter-btn');
  await expect(toggle).toBeChecked();

  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect(await conflictCriteria(page)).toBeUndefined();
});

test('the toggle counts only visible recurring events', async ({ page }) => {
  await loadApp(page);
  await setEvents(page, [
    weeklyEvent('1', 'Practice', ['M'], 15, 17),
    { ...weeklyEvent('2', 'Hidden', ['T'], 15, 17), visible: false },
    {
      ...weeklyEvent('3', 'Once', ['W'], 15, 17),
      eventType: 'one-time',
      date: '2026-11-10',
    },
  ]);
  await page.click('#filter-btn');
  await page.click('#more-filters-toggle');
  await expect(
    page.getByLabel(
      'Hide sections that conflict with calendar events (1 event)',
    ),
  ).toBeVisible();
});

test('the course list follows calendar events added and deleted while the toggle is on', async ({
  page,
}) => {
  await loadApp(page);
  await setEvents(page, [weeklyEvent('1', 'Practice', ['M'], 6, 7)]);
  await page.click('#filter-btn');
  await page.click('#more-filters-toggle');
  await page
    .getByLabel('Hide sections that conflict with calendar events (1 event)')
    .check();

  const preview = page.locator('.filter-preview span');
  const matching = async (): Promise<number> =>
    Number(((await preview.innerText()).match(/^(\d+) courses/) ?? [])[1]);
  const before = await matching();
  expect(before).toBeGreaterThan(0);

  // A job covering the whole working week hides what meets in it, with the
  // toggle left alone.
  await setEvents(page, [
    weeklyEvent('1', 'Practice', ['M'], 6, 7),
    weeklyEvent('2', 'Co-op job', ['M', 'T', 'W', 'R', 'F'], 8, 17),
  ]);
  await expect.poll(matching).toBeLessThan(before);

  // Deleting both brings every course back, and the toggle stays in view so
  // it can be turned off: hidden, it would filter again on the next event.
  await setEvents(page, []);
  await expect.poll(matching).toBe(before);
  await expect(
    page.getByLabel(
      'Hide sections that conflict with calendar events (0 events)',
    ),
  ).toBeChecked();
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

test.describe('no usable section', () => {
  // The scheduler reports why it produced nothing; here that is the point.
  test.use({
    expectedConsole:
      /No valid candidates for CS2102|No schedule generated: no-candidates/,
  });

  test('a course with no usable section is named, on separate banner lines', async ({
    page,
  }) => {
    await loadApp(page);
    await selectCourses(page, ['CS2102']);
    // A term no section is offered in (CS2102 runs in B and D) leaves it
    // with nothing to pick.
    await page.evaluate(() =>
      (window as any).services.filterService.addFilter('term', {
        terms: ['S'],
      }),
    );

    await page.click('#auto-schedule-btn');
    await generateFromIntro(page);

    const message = page.locator('.error-banner-text p').first();
    await expect(message).toContainText('CS2102');
    // innerText keeps the line breaks only if they are rendered.
    const text = await message.evaluate(el => (el as HTMLElement).innerText);
    expect(text).toMatch(/\n• /);
  });
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

/** The auto-schedule settings modal, reached through the intro's Next. */
async function openSettings(page: Page): Promise<void> {
  await page.click('#auto-schedule-btn');
  await page.click(
    '[data-modal-type="auto-schedule-intro"] [data-action="next"]',
  );
}

function rankingRow(page: Page, key: string) {
  return page.locator(`[data-ranking="${key}"]`);
}

/** Sets "Avoid classes before" to High at the given time through the UI. */
async function setEarlyClasses(page: Page, time: string): Promise<void> {
  const row = rankingRow(page, 'earlyClasses');
  await row.getByRole('radio', { name: 'High' }).check();
  await row.getByRole('combobox').selectOption(time);
}

test('a ranking row shows its options only while it is not Off', async ({
  page,
}) => {
  await loadApp(page);
  await selectCourses(page, ['CS2102']);
  await openSettings(page);
  const row = rankingRow(page, 'earlyClasses');
  await expect(row.getByRole('combobox')).toHaveCount(0);

  await row.getByRole('radio', { name: 'Low' }).check();
  await expect(row.getByRole('combobox')).toHaveCount(1);

  await row.getByRole('radio', { name: 'Off' }).check();
  await expect(row.getByRole('combobox')).toHaveCount(0);
});

test('the time settings offer what the hourly class grid can give', async ({
  page,
}) => {
  await loadApp(page);
  await selectCourses(page, ['CS2102']);
  await openSettings(page);

  const options = (row: Locator, index: number) =>
    row.getByRole('combobox').nth(index).locator('option').allTextContents();
  const gaps = rankingRow(page, 'gaps');
  expect(await options(gaps, 0)).toEqual([
    'Back to back',
    '1 free hour',
    '2 free hours',
  ]);
  expect(await options(gaps, 1)).toEqual([
    'Back to back',
    '1 free hour',
    '2 free hours',
    '3 free hours',
    '4 free hours',
  ]);

  const lunch = rankingRow(page, 'lunch');
  await lunch.getByRole('radio', { name: 'Low' }).check();
  expect(await options(lunch, 0)).toEqual(['1 hour', '2 hours']);
  const times = await lunch
    .getByRole('combobox')
    .nth(1)
    .locator('option')
    .evaluateAll(all => all.map(o => (o as HTMLOptionElement).value));
  expect(times.length).toBeGreaterThan(0);
  expect(times.every(t => t.endsWith(':00'))).toBe(true);
});

test('the filters in the settings stay folded until opened, then stay open', async ({
  page,
}) => {
  await loadApp(page);
  await selectCourses(page, ['CS2102']);
  await openSettings(page);
  const toggle = page.locator('#auto-schedule-filters-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#available-only-filter')).toHaveCount(0);

  await toggle.click();
  await page.check('#available-only-filter');
  await expect(toggle).toContainText('active');

  await page.keyboard.press('Escape');
  await page.click('#auto-schedule-btn');
  await page.click(
    '[data-modal-type="auto-schedule-intro"] [data-action="next"]',
  );
  await expect(page.locator('#available-only-filter')).toBeChecked();
});

test('ranking preferences persist across a reload', async ({ page }) => {
  await loadApp(page);
  await selectCourses(page, ['CS2102']);
  await openSettings(page);
  await setEarlyClasses(page, '10:00');

  const stored = () =>
    page.evaluate(
      () =>
        (window as any).services.profileStateManager.getPreferences()
          .autoSchedule?.earlyClasses,
    );
  await expect.poll(stored).toEqual({ importance: 'high', before: '10:00' });

  await page.reload();
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
  await page.click('#schedule-tab');
  await openSettings(page);
  const row = rankingRow(page, 'earlyClasses');
  await expect(row.getByRole('radio', { name: 'High' })).toBeChecked();
  await expect(row.getByRole('combobox')).toHaveValue('10:00');
  // Reset appears once something differs from the defaults, and restores them.
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(row.getByRole('radio', { name: 'Off' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Reset' })).toHaveCount(0);
});

test('the early-classes preference picks the later lecture section', async ({
  page,
}) => {
  // HI2314 (term C) has one lecture at 9:00 and another at 10:00, no labs.
  await loadApp(page);
  await selectCourses(page, ['HI2314']);

  const lectureStart = () =>
    page.evaluate(() => {
      const sc = (window as any).services.courseSelectionService
        .getSelectedCourses()
        .find(
          (c: any) =>
            `${c.course.departmentAbbr}${c.course.number}` === 'HI2314',
        );
      const lecture = sc.selected.lecture;
      return Math.min(
        ...lecture.periods
          .filter((p: any) => !p.isAsync)
          .map((p: any) => p.startTime.hours * 60 + p.startTime.minutes),
      );
    });

  // Without a preference the first-listed (9:00) section wins.
  await page.click('#auto-schedule-btn');
  await generateFromIntro(page);
  expect(await lectureStart()).toBeLessThan(10 * 60);

  await page.getByRole('button', { name: 'Restart auto-schedule' }).click();
  await page.click(
    '[data-modal-type="auto-schedule-intro"] [data-action="next"]',
  );
  await setEarlyClasses(page, '10:00');
  await page.click('#modal-primary-btn');
  await expect(page.locator('.schedule-generating-overlay')).toHaveCount(0, {
    timeout: 60_000,
  });
  expect(await lectureStart()).toBeGreaterThanOrEqual(10 * 60);
});

const WEEK = ['M', 'T', 'W', 'R', 'F'];
// 8-5 leaves these two courses no section at all; 8-12 leaves some.
const WORKDAY = weeklyEvent('job', 'Co-op job', WEEK, 8, 17);
const MORNING = weeklyEvent('job', 'Co-op job', WEEK, 8, 12);

/** Start and end minutes of every meeting of the selected sections. */
async function selectedMeetings(page: Page): Promise<[number, number][]> {
  return page.evaluate(() =>
    (window as any).services.courseSelectionService
      .getSelectedCourses()
      .flatMap((sc: any) =>
        ['lecture', 'discussion', 'lab']
          .map(k => sc.selected?.[k])
          .filter(Boolean),
      )
      .flatMap((s: any) => s.periods)
      .filter((p: any) => !p.isAsync)
      .map((p: any) => [
        p.startTime.hours * 60 + p.startTime.minutes,
        p.endTime.hours * 60 + p.endTime.minutes,
      ]),
  );
}

const inMorning = ([start, end]: [number, number]): boolean =>
  start < 12 * 60 && 8 * 60 < end;
const inWorkday = ([start, end]: [number, number]): boolean =>
  start < 17 * 60 && 8 * 60 < end;

test('Auto-Schedule keeps classes clear of calendar events by default', async ({
  page,
}) => {
  await loadApp(page);
  await setEvents(page, [MORNING]);
  await selectCourses(page, ['CS2102', 'MA1022']);
  await page.click('#auto-schedule-btn');
  await page.click(
    '[data-modal-type="auto-schedule-intro"] [data-action="next"]',
  );
  // The setting sits in the settings' folded Filters section.
  await page.click('#auto-schedule-filters-toggle');
  const keepClear = page.getByLabel(
    'Keep classes clear of my calendar events (1 event)',
  );
  await expect(keepClear).toBeChecked();
  await page.click('#modal-primary-btn');
  await expect(page.locator('.schedule-generating-overlay')).toHaveCount(0, {
    timeout: 60_000,
  });

  const meetings = await selectedMeetings(page);
  expect(meetings.length).toBeGreaterThan(0);
  expect(meetings.filter(inMorning)).toEqual([]);
});

test('opting out of the calendar lets Auto-Schedule use the time', async ({
  page,
}) => {
  await loadApp(page);
  await setEvents(page, [WORKDAY]);
  await selectCourses(page, ['CS2102', 'MA1022']);
  await openSettings(page);
  await page.click('#auto-schedule-filters-toggle');
  await page
    .getByLabel('Keep classes clear of my calendar events (1 event)')
    .uncheck();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).services.profileStateManager.getPreferences()
            .avoidCalendarEvents,
      ),
    )
    .toBe(false);
  await page.click('#modal-primary-btn');
  await expect(page.locator('.schedule-generating-overlay')).toHaveCount(0, {
    timeout: 60_000,
  });

  const meetings = await selectedMeetings(page);
  expect(meetings.length).toBeGreaterThan(0);
  expect(meetings.some(inWorkday)).toBe(true);
});

test('a class over a calendar event shows a conflict on the grid', async ({
  page,
}) => {
  await loadApp(page);
  await page.click('#schedule-tab');
  const hit = await page.evaluate(async () => {
    const services = (window as any).services;
    const course = services.courseDataService
      .getAllDepartments()
      .flatMap((d: any) => d.courses)
      .find(
        (c: any) =>
          `${c.departmentAbbr}${c.number}` === 'CS2102' && c.lectures?.length,
      );
    const lecture = course.lectures.find(
      (l: any) =>
        l.section.periods[0]?.days?.size && !l.section.periods[0].isAsync,
    ).section;
    await services.courseSelectionService.selectCourse(course);
    await services.courseSelectionService.setSelectedSection(
      course,
      lecture.number,
    );
    const p = lecture.periods[0];
    const term = lecture.computedTerm === 'F' ? 'A' : lecture.computedTerm;
    return {
      term,
      day: [...p.days][0],
      start: p.startTime.hours,
      end: p.endTime.hours + 1,
    };
  });
  await setEvents(page, [
    weeklyEvent('clash', 'Work Shift', [hit.day], hit.start, hit.end, [
      hit.term,
    ]),
  ]);
  await expect(
    page.locator(`.term-graph[data-term="${hit.term}"] .conflict-overlay`),
  ).not.toHaveCount(0);
  await expect(
    page
      .locator(`.term-graph[data-term="${hit.term}"] .conflict-overlay`)
      .first(),
  ).toHaveAttribute('data-conflicts-with', /CS2102 \w+, Work Shift/);
  await expect(
    page.locator(`.term-graph[data-term="${hit.term}"] .term-conflict-warning`),
  ).toBeVisible();
});

/** Holds each worker job back so a run can be interrupted. */
async function delayWorker(page: Page, ms: number): Promise<void> {
  await page.addInitScript(delay => {
    const RealWorker = window.Worker;
    window.Worker = class extends RealWorker {
      postMessage(message: unknown): void {
        setTimeout(() => super.postMessage(message), delay);
      }
    };
  }, ms);
}

/** Section CRNs chosen in the active schedule, by course. */
function pickedCrns(page: Page): Promise<number> {
  return page.evaluate(() =>
    (window as any).services.courseSelectionService.getSelectedCourses().reduce(
      (n: number, sc: any) =>
        n +
        Object.values(sc.selected ?? {})
          .flat()
          .filter(Boolean).length,
      0,
    ),
  );
}

test('a run finished after switching schedules is discarded', async ({
  page,
}) => {
  await delayWorker(page, 1500);
  await loadApp(page);
  await selectCourses(page, COURSES);
  await page.click('#auto-schedule-btn');
  await page.click(
    '[data-modal-type="auto-schedule-intro"] [data-action="next"]',
  );
  await page.click('#modal-primary-btn');
  await expect(page.locator('.schedule-generating-overlay')).toBeVisible();

  const otherId = await page.evaluate(() => {
    const psm = (window as any).services.profileStateManager;
    const other = psm.createSchedule('Other');
    psm.setActiveSchedule(other.id);
    return other.id;
  });
  await expect(page.locator('.schedule-generating-overlay')).toHaveCount(0, {
    timeout: 30_000,
  });

  await expect(page.locator('.error-banner')).toContainText('discarded');
  expect(await pickedCrns(page)).toBe(0);
  const active = await page.evaluate(
    () => (window as any).services.profileStateManager.getActiveSchedule().id,
  );
  expect(active).toBe(otherId);
  await expect(page.locator('#auto-schedule-btn')).toBeVisible();
});

test('one Undo after Generate returns to the schedule from before it', async ({
  page,
}) => {
  await loadApp(page);
  await selectCourses(page, COURSES);
  await page.click('#auto-schedule-btn');
  await generateFromIntro(page);
  expect(await pickedCrns(page)).toBeGreaterThan(0);

  const undone = await page.evaluate(async () => {
    await (window as any).services.profileStateManager.undo();
    return true;
  });
  expect(undone).toBe(true);
  expect(await pickedCrns(page)).toBe(0);
  await page.evaluate(() =>
    (window as any).services.profileStateManager.redo(),
  );
  expect(await pickedCrns(page)).toBeGreaterThan(0);
});

test('results announce "N of M" and keep focus off the page body', async ({
  page,
}) => {
  await loadApp(page);
  await selectCourses(page, COURSES);
  await page.click('#auto-schedule-btn');
  await generateFromIntro(page);

  const status = page.locator('.schedule-result-status');
  await expect(status).toHaveAttribute('role', 'status');
  await expect(status).toHaveText(/^Schedule 1 of \d+$/);
  await expect(
    page.getByRole('button', { name: 'Next schedule' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Next schedule' }).click();
  await expect(status).toHaveText(/^Schedule 2 of \d+$/);
});

test('the folded Filters badge counts only what Auto-Schedule honours', async ({
  page,
}) => {
  await loadApp(page);
  await selectCourses(page, COURSES);
  await page.evaluate(() => {
    const f = (window as any).services.filterService;
    f.addFilter('courseLevel', { min: 4, max: 4 });
    f.addFilter('periodConflict', {
      avoidConflicts: false,
      blockedSlots: [],
      selectedCourses: [],
      semesterSpansQuarters: true,
    });
  });
  await openSettings(page);
  const toggle = page.locator('#auto-schedule-filters-toggle');
  await expect(toggle).not.toContainText('active');
  // The course-list-only filters are not offered here at all.
  await expect(page.locator('#modal-primary-btn')).toBeVisible();
  await expect(page.getByText('Course Level')).toHaveCount(0);
  await expect(page.getByText('Credit Hours')).toHaveCount(0);
  await expect(page.locator('.filter-preview')).not.toContainText('0 sections');
});

test('opting out of keeping clear of events shows in the folded badge and Clear All undoes it', async ({
  page,
}) => {
  await loadApp(page);
  await selectCourses(page, ['CS2102']);
  await setEvents(page, [weeklyEvent('1', 'Work', ['M'], 9, 11)]);
  await openSettings(page);
  const toggle = page.locator('#auto-schedule-filters-toggle');
  await toggle.click();
  await page.uncheck('#keep-clear-of-events');
  await toggle.click();
  await expect(toggle).toContainText('1 active');

  await page.getByRole('button', { name: 'Clear All' }).click();
  await expect(toggle).not.toContainText('active');
  await toggle.click();
  await expect(page.locator('#keep-clear-of-events')).toBeChecked();
});
