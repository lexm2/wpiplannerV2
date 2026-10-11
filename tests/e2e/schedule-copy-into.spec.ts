import { test, expect, type Page } from './fixtures';

/**
 * "Copy Into" in the schedule picker: pick a source schedule, then click the
 * schedule to merge its courses into.
 */

const PICKER = '[data-modal-type="schedule-picker"]';

test.beforeEach(async ({ page }) => {
  // Skip the first-visit welcome tutorial so it doesn't overlay the flow.
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
});

/**
 * Two schedules sharing one course: "First" (active) holds courses 0 and 1,
 * "Second" holds 1 and 2. Course 3 is left unselected for tests that need a
 * fresh edit. Returns the ids involved.
 */
async function seed(page: Page) {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );

  return page.evaluate(async () => {
    const svc: any = (window as any).services;
    const sms = svc.scheduleManagementService;
    const sel = svc.courseSelectionService;
    await sms.initialize();

    const courses = svc.courseDataService
      .getAllDepartments()
      .flatMap((d: any) => d.courses)
      .slice(0, 4);

    const firstId = sms.getActiveScheduleId();
    await sms.renameSchedule(firstId, 'First');
    await sel.selectCourse(courses[0]);
    await sel.selectCourse(courses[1]);

    const created = await sms.createNewSchedule('Second');
    const secondId = created.schedule.id;
    await sel.selectCourse(courses[1]);
    await sel.selectCourse(courses[2]);

    await sms.setActiveSchedule(firstId);
    return {
      firstId,
      secondId,
      courseIds: courses.map((c: any) => c.id) as string[],
    };
  });
}

async function courseIdsOf(page: Page, scheduleId: string) {
  return page.evaluate(id => {
    const sms = (window as any).services.scheduleManagementService;
    return sms
      .getScheduleById(id)
      .selectedCourses.map((sc: any) => sc.course.id)
      .sort();
  }, scheduleId);
}

const row = (page: Page, id: string) =>
  page.locator(`${PICKER} .schedule-item[data-schedule-id="${id}"]`);

test('copies one schedule into another without duplicating shared courses', async ({
  page,
}) => {
  const { firstId, secondId, courseIds } = await seed(page);

  await page.click('#schedule-picker-btn');
  await row(page, secondId).getByRole('button', { name: 'Copy Into' }).click();

  const banner = page.locator(`${PICKER} .schedule-copy-banner`);
  await expect(banner).toContainText('Second');
  await expect(row(page, firstId)).toContainText('Copy here');

  await row(page, firstId).click();
  await expect(banner).toBeHidden();
  await expect(row(page, firstId)).toContainText('3 courses');

  expect(await courseIdsOf(page, firstId)).toEqual(
    courseIds.slice(0, 3).sort(),
  );
  // The source is left as it was.
  expect(await courseIdsOf(page, secondId)).toEqual(
    [courseIds[1], courseIds[2]].sort(),
  );

  // First is the active schedule, so the live selection picks up the copy.
  const live = await page.evaluate(() =>
    (window as any).services.courseSelectionService
      .getSelectedCourses()
      .map((sc: any) => sc.course.id)
      .sort(),
  );
  expect(live).toEqual(courseIds.slice(0, 3).sort());
});

test('cancel leaves copy mode without copying or switching', async ({
  page,
}) => {
  const { firstId, secondId, courseIds } = await seed(page);

  await page.click('#schedule-picker-btn');
  await row(page, firstId).getByRole('button', { name: 'Copy Into' }).click();

  // Clicking the source itself does nothing.
  await row(page, firstId).click();
  const banner = page.locator(`${PICKER} .schedule-copy-banner`);
  await expect(banner).toBeVisible();

  await banner.getByRole('button', { name: 'Cancel' }).click();
  await expect(banner).toBeHidden();

  expect(await courseIdsOf(page, secondId)).toEqual(
    [courseIds[1], courseIds[2]].sort(),
  );
  const active = await page.evaluate(() =>
    (window as any).services.scheduleManagementService.getActiveScheduleId(),
  );
  expect(active).toBe(firstId);
});

async function undo(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as any).services.profileStateManager.undo(),
  );
}

test('a copy into the active schedule is one undo step and keeps earlier history', async ({
  page,
}) => {
  const { firstId, secondId, courseIds } = await seed(page);
  // An edit made before the copy, which the copy must not wipe out.
  await page.evaluate(async id => {
    const svc: any = (window as any).services;
    const course = svc.courseDataService
      .getAllDepartments()
      .flatMap((d: any) => d.courses)
      .find((c: any) => c.id === id);
    await svc.courseSelectionService.selectCourse(course);
  }, courseIds[3]);

  await page.click('#schedule-picker-btn');
  await row(page, secondId).getByRole('button', { name: 'Copy Into' }).click();
  await row(page, firstId).click();
  await expect(row(page, firstId)).toContainText('4 courses');
  await expect(page.locator('#undo-btn')).toBeEnabled();

  await undo(page);
  expect(await courseIdsOf(page, firstId)).toEqual(
    [courseIds[0], courseIds[1], courseIds[3]].sort(),
  );
  await undo(page);
  expect(await courseIdsOf(page, firstId)).toEqual(
    [courseIds[0], courseIds[1]].sort(),
  );
});

test('a copy into an inactive schedule is undone by one undo', async ({
  page,
}) => {
  const { firstId, secondId, courseIds } = await seed(page);

  await page.click('#schedule-picker-btn');
  await row(page, firstId).getByRole('button', { name: 'Copy Into' }).click();
  await row(page, secondId).click();
  await expect(row(page, secondId)).toContainText('3 courses');

  await undo(page);
  expect(await courseIdsOf(page, secondId)).toEqual(
    [courseIds[1], courseIds[2]].sort(),
  );
});

test('copy mode ends if the source schedule goes away', async ({ page }) => {
  const { firstId } = await seed(page);

  await page.click('#schedule-picker-btn');
  await row(page, firstId).getByRole('button', { name: 'Duplicate' }).click();
  const copy = page.locator(`${PICKER} .schedule-item`, {
    hasText: 'First (Copy)',
  });
  await copy.getByRole('button', { name: 'Copy Into' }).click();
  await expect(page.locator(`${PICKER} .schedule-copy-banner`)).toBeVisible();

  // Undo the duplicate out from under copy mode.
  for (let i = 0; i < 3 && (await copy.count()) > 0; i++) await undo(page);
  await expect(copy).toHaveCount(0);

  await expect(page.locator(PICKER)).not.toContainText('Copy here');
  await expect(
    row(page, firstId).getByRole('button', { name: 'Rename' }),
  ).toBeVisible();
});

test('the copy banner hides the rows scrolling under it', async ({ page }) => {
  await seed(page);
  await page.click('#schedule-picker-btn');
  await page
    .locator(`${PICKER} .schedule-item`)
    .first()
    .getByRole('button', { name: 'Copy Into' })
    .click();

  const alpha = await page
    .locator(`${PICKER} .schedule-copy-banner`)
    .evaluate(el => {
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g) ?? [];
      return m.length === 4 ? Number(m[3]) : 1;
    });
  expect(alpha).toBe(1);
});

test('Escape cancels copy mode without closing the picker', async ({
  page,
}) => {
  const { firstId } = await seed(page);
  await page.click('#schedule-picker-btn');
  await row(page, firstId).getByRole('button', { name: 'Copy Into' }).click();
  const banner = page.locator(`${PICKER} .schedule-copy-banner`);
  await expect(banner).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(banner).toBeHidden();
  await expect(page.locator(PICKER)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator(PICKER)).toBeHidden();
});

test('copy mode works from the keyboard', async ({ page }) => {
  const { firstId, secondId, courseIds } = await seed(page);
  await page.click('#schedule-picker-btn');

  await row(page, secondId).getByRole('button', { name: 'Copy Into' }).focus();
  await page.keyboard.press('Enter');

  // Focus lands on a target, not on <body>.
  const target = row(page, firstId).getByRole('button', { name: /Copy here/ });
  await expect(target).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.locator(`${PICKER} .schedule-copy-banner`)).toBeHidden();
  expect(await courseIdsOf(page, firstId)).toEqual(
    [courseIds[0], courseIds[1], courseIds[2]].sort(),
  );
});

test.describe('narrow window', () => {
  test.use({ viewport: { width: 1000, height: 700 } });

  test('the More options menu stays inside the window', async ({ page }) => {
    await seed(page);
    await page.evaluate(async () => {
      const sms = (window as any).services.scheduleManagementService;
      for (let i = 0; i < 5; i++)
        await sms.createNewSchedule(`Extra ${i}`, { autoActivate: false });
    });

    await page.click('#settings-menu-btn');
    await page
      .locator('#settings-dropdown-menu .settings-menu-item')
      .first()
      .click();

    const rows = page.locator(`${PICKER} .schedule-item`);
    await expect(rows).toHaveCount(7);
    for (let i = 0; i < 7; i++) {
      const more = rows.nth(i).getByTitle('More options');
      await more.scrollIntoViewIfNeeded();
      await more.click();
      const menu = rows.nth(i).locator('[data-visible="true"]');
      const box = await menu.boundingBox();
      expect(box, `row ${i} menu`).not.toBeNull();
      expect(box!.y, `row ${i} menu top`).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height, `row ${i} menu bottom`).toBeLessThanOrEqual(
        700,
      );
      expect(box!.x + box!.width, `row ${i} menu right`).toBeLessThanOrEqual(
        1000,
      );
      // A second click on the same button closes it.
      await more.click();
    }
  });
});
