import { test, expect, type Page } from './fixtures';

/**
 * What a tutorial does to a real student's planner, and what it does when the
 * student doesn't follow the script. tutorial-walkthrough and tutorial-highlight
 * prove each step can be reached and clicked; these prove the clicks mean what
 * the steps say, and that the student's own work comes out the other side intact.
 */

test.use({ viewport: { width: 1280, height: 800 } });

const SKIP = '[data-tutorial-skip]';
const NEXT = '[data-tutorial-next]';
const FIND = '[data-tutorial-find]';
const LOST = '[data-tutorial-lost]';

type Step = { tutorial: string; index: number; selector: string } | null;

function currentStep(page: Page): Promise<Step> {
  return page.evaluate(() => {
    const svc = (window as any).services.tutorial.service;
    const step = svc.getCurrentStep();
    return step
      ? {
          tutorial: svc.getActiveTutorial().id,
          index: svc.getCurrentStepIndex(),
          selector: step.selector,
        }
      : null;
  });
}

const stepKey = (s: Step) => (s ? `${s.tutorial}#${s.index}` : 'done');

async function expectStep(page: Page, key: string): Promise<void> {
  await expect.poll(async () => stepKey(await currentStep(page))).toBe(key);
}

/** First visit: the welcome tutorial starts by itself. */
async function firstVisit(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.tutorial?.service.getActiveTutorial()?.id ===
      'welcome',
  );
  await expect(page.locator(SKIP)).toBeVisible();
}

/** A returning student with a schedule of their own holding a real course. */
async function returningStudent(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('wpi_visited', 'true'));
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments().length >
      0,
  );
  await page.evaluate(async () => {
    const s = (window as any).services;
    await s.scheduleManagementService.createNewSchedule('My Real Plan');
    const course = s.courseDataService
      .getAllDepartments()
      .find((d: any) => d.abbreviation === 'CS')
      .courses.find((c: any) => c.lectures?.length);
    await s.courseSelectionService.selectCourse(course);
  });
}

async function startFromMenu(page: Page, id: string): Promise<void> {
  await page.click('#settings-menu-btn');
  await page.click('#tutorials-btn');
  await page.click(`[data-tutorial-id="${id}"]`);
  await expectStep(page, `${id}#0`);
}

/** Do what the step asks: click its target, or Next where it only explains. */
async function doStep(page: Page): Promise<void> {
  const step = await currentStep(page);
  const manual = await page.evaluate(
    () =>
      (window as any).services.tutorial.service.getCurrentStep().waitFor ===
      'manual',
  );
  await page
    .locator(manual ? NEXT : step!.selector)
    .first()
    .click();
  await expect
    .poll(async () => stepKey(await currentStep(page)))
    .not.toBe(stepKey(step));
}

async function walkTo(page: Page, key: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (stepKey(await currentStep(page)) === key) return;
    await doStep(page);
  }
  throw new Error(`never reached ${key}`);
}

const schedules = (page: Page) =>
  page.evaluate(() => {
    const m = (window as any).services.scheduleManagementService;
    return {
      names: m.getAllSchedules().map((s: any) => s.name) as string[],
      active: m
        .getAllSchedules()
        .find((s: any) => s.id === m.getActiveScheduleId())?.name as string,
    };
  });

const filters = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      (window as any).services.filterService
        .getActiveFilters()
        .map((f: any) => [f.id, f.criteria]),
    ),
  );

test('hands back the student’s filters, search and page', async ({ page }) => {
  await returningStudent(page);
  await page.fill('.search-input-wrapper input', 'calculus');
  await page.evaluate(() =>
    (window as any).services.filterService.addFilter('term', { terms: ['A'] }),
  );
  await expect
    .poll(async () => (await filters(page)).searchText?.query)
    .toBe('calculus');
  await page.click('#degree-tab');
  const before = await filters(page);

  await startFromMenu(page, 'welcome');
  // Their search would otherwise hide the very course the step points at.
  await doStep(page);
  await expect(page.locator((await currentStep(page))!.selector)).toBeVisible();

  await page.click(SKIP);
  await expect(page.locator(SKIP)).toHaveCount(0);
  await expect.poll(() => filters(page)).toEqual(before);
  await expect(page.locator('.search-input-wrapper input')).toHaveValue(
    'calculus',
  );
  await expect(page.locator('#degree-tab')).toHaveClass(/active/);
  expect((await schedules(page)).active).toBe('My Real Plan');
});

test('a schedule the student named Tutorial is theirs', async ({ page }) => {
  await returningStudent(page);
  await page.evaluate(async () => {
    const m = (window as any).services.scheduleManagementService;
    await m.createNewSchedule('Tutorial');
    await m.createNewSchedule('Tutorial (study blocks)');
  });

  await startFromMenu(page, 'welcome');
  await page.click(SKIP);
  await expect(page.locator(SKIP)).toHaveCount(0);

  await expect
    .poll(async () => (await schedules(page)).names)
    .toEqual([
      'My Schedule',
      'My Real Plan',
      'Tutorial',
      'Tutorial (study blocks)',
    ]);
});

test('undo stays out of the tutorial, during and after', async ({ page }) => {
  await returningStudent(page);
  await startFromMenu(page, 'welcome');
  await walkTo(page, 'welcome#3');

  await expect(page.locator('#undo-btn')).toBeDisabled();
  await page.keyboard.press('Control+z');
  await expect(
    page.locator('.schedule-course-item[data-course-id="TUT-2001"]'),
  ).toBeVisible();

  await page.click(SKIP);
  await expect(page.locator(SKIP)).toHaveCount(0);
  // Undoing past the end would bring the tutorial's schedule back to life.
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).services.profileStateManager.canUndo(),
      ),
    )
    .toBe(false);
});

test('creating a schedule at the end lands on it', async ({ page }) => {
  await firstVisit(page);
  await startFromMenu(page, 'schedules');
  await walkTo(page, 'schedules#4');

  await page.click('#new-schedule-btn');
  await page.getByPlaceholder('Schedule name').fill('Fall plan');
  await page.keyboard.press('Enter');

  await expect(page.locator(SKIP)).toHaveCount(0);
  await expect
    .poll(() => schedules(page))
    .toEqual({ names: ['My Schedule', 'Fall plan'], active: 'Fall plan' });
});

test('picking another schedule mid-tutorial stays on it', async ({ page }) => {
  await returningStudent(page);
  await startFromMenu(page, 'schedules');
  await doStep(page);

  await page
    .locator('.schedule-picker-modal-dialog .schedule-list')
    .getByText('My Schedule')
    .click();

  await expect(page.locator(SKIP)).toHaveCount(0);
  await expect
    .poll(() => schedules(page))
    .toEqual({ names: ['My Schedule', 'My Real Plan'], active: 'My Schedule' });
});

test('deleting their only schedule mid-tutorial still leaves them one', async ({
  page,
}) => {
  await firstVisit(page);
  await page.evaluate(async () => {
    const m = (window as any).services.scheduleManagementService;
    const mine = m
      .getAllSchedules()
      .find((s: any) => !s.id.startsWith('tutorial_'));
    await m.deleteSchedule(mine.id, { force: true });
  });

  await page.click(SKIP);
  await expect(page.locator(SKIP)).toHaveCount(0);
  await expect
    .poll(() => schedules(page))
    .toEqual({ names: ['My Schedule'], active: 'My Schedule' });
});

test('a reload mid-tutorial leaves no trace', async ({ page }) => {
  await returningStudent(page);
  await startFromMenu(page, 'welcome');
  await walkTo(page, 'welcome#4');

  // What older builds wrote: a saved tutorial schedule.
  await page.evaluate(async () => {
    const { profileStateManager: state } = (window as any).services;
    await state.storageManager.indexedDBStorage.saveSchedule({
      ...state.getAllSchedules()[0],
      id: 'tutorial_old',
      name: 'Tutorial',
    });
  });

  await page.reload();
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments().length >
      0,
  );

  await expect
    .poll(() => schedules(page))
    .toEqual({
      names: ['My Schedule', 'My Real Plan'],
      active: 'My Real Plan',
    });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db: IDBDatabase = await new Promise(resolve => {
          const open = indexedDB.open('wpi-planner-db');
          open.onsuccess = () => resolve(open.result);
        });
        const keys: string[] = await new Promise(resolve => {
          const all = db
            .transaction('schedules')
            .objectStore('schedules')
            .getAllKeys();
          all.onsuccess = () => resolve(all.result as string[]);
        });
        db.close();
        return keys.filter(k => k.startsWith('tutorial_'));
      }),
    )
    .toEqual([]);
});

test('each click does what its step says', async ({ page }) => {
  await firstVisit(page);
  await walkTo(page, 'filtering#3');
  expect((await filters(page)).term).toEqual({ terms: ['B'] });
  await expect(page.locator('#avoid-conflicts-filter')).not.toBeChecked();
  await doStep(page);
  await expect(page.locator('#avoid-conflicts-filter')).toBeChecked();
  await doStep(page);
  await expect(page.locator('#available-only-filter')).toBeChecked();

  await walkTo(page, 'autoSchedule#4');
  const badge = (id: string) =>
    page.locator(
      `.as-course-card[data-course-id="${id}"] [data-term-badge][data-term="C"]`,
    );
  await expect(badge('TUT-2001')).toHaveAttribute('aria-pressed', 'true');
  await doStep(page);
  await expect(badge('TUT-2001')).toHaveAttribute('aria-pressed', 'false');
  await doStep(page);
  await expect(badge('TUT-2006')).toHaveAttribute('aria-pressed', 'false');

  await walkTo(page, 'autoSchedule#9');
  const sections = () =>
    page.evaluate(() =>
      Object.fromEntries(
        (window as any).services.courseSelectionService
          .getSelectedCourses()
          .map((sc: any) => [sc.course.id, sc.selected?.lecture?.number]),
      ),
    );
  await expect.poll(async () => (await sections())['TUT-2001']).toBeTruthy();
  const picked = await sections();
  expect(picked['TUT-2008']).toContain('TA03');
  // Both offer A and C; the step said A.
  expect(picked['TUT-2001']).toMatch(/^TA/);
  expect(picked['TUT-2006']).toMatch(/^TA/);
  await expect(page.locator('.error-banner')).toHaveCount(0);
});

test('double-clicking a target counts as one click', async ({ page }) => {
  await firstVisit(page);
  await walkTo(page, 'welcome#4');

  await page.locator('[data-crn="100108"]').dblclick();

  await expectStep(page, 'welcome#5');
  // Still picked, so the wizard still offers the step's Next.
  await expect(page.locator('#wizard-next-btn')).toBeVisible();

  // Unpicking it later, on purpose, loses that button; the step can bring it back.
  await page.locator('[data-crn="100108"]').click();
  await expect(page.locator(LOST)).toBeVisible({ timeout: 4_000 });
  await page.click(FIND);
  await page.locator('#wizard-next-btn').click();
  await expectStep(page, 'welcome#6');
});

test('Find Element brings back what the student closed or left', async ({
  page,
}) => {
  await firstVisit(page);

  // Closed the window the step works in.
  await walkTo(page, 'welcome#4');
  await expect(page.locator(LOST)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-crn="100108"]')).toHaveCount(0);
  await expect(page.locator(LOST)).toBeVisible({ timeout: 4_000 });
  await page.click(FIND);
  await page.locator('[data-crn="100108"]').click();
  await expectStep(page, 'welcome#5');

  // Wandered off to another page.
  await page.evaluate(() => (window as any).services.tutorial.start('welcome'));
  await expectStep(page, 'welcome#0');
  await walkTo(page, 'welcome#3');
  const target = page.locator(
    '.schedule-course-item[data-course-id="TUT-2001"]',
  );
  await page.click('#planner-tab');
  await expect(target).toBeHidden();
  await page.click(FIND);
  await expect(target).toBeVisible();
  await target.click();
  await expectStep(page, 'welcome#4');
});

test('the keyboard can reach Next from a step inside a window', async ({
  page,
}) => {
  await firstVisit(page);
  await page.evaluate(() =>
    (window as any).services.tutorial.start('schedules'),
  );
  await expectStep(page, 'schedules#0');
  await doStep(page);
  await expect(page.locator('.schedule-picker-modal-dialog')).toBeVisible();

  const onNext = () =>
    page.evaluate(
      () => !!document.activeElement?.hasAttribute('data-tutorial-next'),
    );
  const inScope = () =>
    page.evaluate(
      () =>
        !!document.activeElement?.closest(
          '[data-tutorial-box], .schedule-picker-modal-dialog',
        ),
    );

  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) {
    await page.keyboard.press('Tab');
    expect(await inScope()).toBe(true);
    reached = await onNext();
  }
  expect(reached).toBe(true);

  // Tab round again stays in the window and the box, both ways.
  await page.keyboard.press('Tab');
  expect(await inScope()).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await onNext()).toBe(true);

  await page.keyboard.press('Enter');
  await expectStep(page, 'schedules#2');
});

test.describe('tutorial file missing', () => {
  test.use({ expectedConsole: /Could not start the welcome tutorial/ });

  test('a first visit carries on without it', async ({ page }) => {
    await page.route('**/tutorial-courses.json', route => route.abort());
    await page.goto('/');
    await page.waitForFunction(
      () =>
        (window as any).services?.courseDataService?.getAllDepartments()
          .length > 0,
    );
    await expect(page.locator('[data-course-id]').first()).toBeVisible();

    await expect(page.locator('.error-banner')).toHaveCount(0);
    await expect(page.locator(SKIP)).toHaveCount(0);
    // So the next visit tries again.
    expect(
      await page.evaluate(() => localStorage.getItem('wpi_visited')),
    ).toBeNull();
  });
});

test('tutorial courses follow the catalog into a later year', async ({
  page,
}) => {
  await page.route('**/tutorial-courses.json', async route => {
    const response = await route.fetch();
    const json = await response.json();
    for (const course of json.courses) course.academicYear = 2019;
    await route.fulfill({ response, json });
  });
  await firstVisit(page);
  await doStep(page);
  await expect(
    page.locator('[data-course-id="TUT-2001"] [data-select-btn]'),
  ).toBeVisible();
});

// The first-visit tutorial can still be loading when the student picks one from
// the list.
test('starting a tutorial while one is starting runs just the one', async ({
  page,
}) => {
  await returningStudent(page);
  await page.evaluate(() => {
    const { tutorial } = (window as any).services;
    void tutorial.start('welcome');
    void tutorial.start('schedules');
  });
  await expectStep(page, 'welcome#0');
  await expect
    .poll(() => schedules(page))
    .toEqual({
      names: ['My Schedule', 'My Real Plan', 'Tutorial'],
      active: 'Tutorial',
    });
});

test('a step follows its target across a breakpoint', async ({ page }) => {
  await firstVisit(page);

  // The header folds Schedules into the gear menu.
  await page.evaluate(() =>
    (window as any).services.tutorial.start('schedules'),
  );
  await expectStep(page, 'schedules#0');
  await page.setViewportSize({ width: 1100, height: 800 });
  const gear = page.locator('#settings-menu-btn');
  await expect(gear.locator('.tutorial-highlight-svg')).toBeAttached();
  await gear.click();
  await page.click('#settings-schedules-btn');
  await expectStep(page, 'schedules#1');
  await page.click(SKIP);

  // The schedule sidebar turns into a drawer.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => (window as any).services.tutorial.start('welcome'));
  await walkTo(page, 'welcome#3');
  await page.setViewportSize({ width: 900, height: 800 });
  const target = page.locator(
    '.schedule-course-item[data-course-id="TUT-2001"]',
  );
  await target.click();
  await expectStep(page, 'welcome#4');
});
