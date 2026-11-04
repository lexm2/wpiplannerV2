import { readFileSync } from 'node:fs';
import { test, expect, type Page } from './fixtures';

/**
 * The Calendar Events manager: listing, editing, deleting (one and many) the
 * schedule's events, opening Edit from a grid block, and its empty state.
 */

const FIXTURE = 'tests/fixtures/ics/weekly-sample.ics';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
});

async function openSchedule(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
  await page.click('#schedule-tab');
  await expect(page.locator('.schedule-main')).toBeVisible();
}

const t = (hours: number, minutes = 0) => ({ hours, minutes });

/** Puts four events on the active schedule: three recurring, one one-time. */
async function seedEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const svc = (window as any).services.profileStateManager;
    const base = { visible: true, createdAt: 1000, updatedAt: 1000 };
    svc.updateSchedule(
      svc.getActiveSchedule().id,
      {
        localEvents: [
          {
            ...base,
            id: 'ev-work',
            title: 'Work Shift',
            eventType: 'recurring',
            days: ['M', 'W'],
            terms: ['A', 'B'],
            startTime: { hours: 9, minutes: 0 },
            endTime: { hours: 11, minutes: 0 },
          },
          {
            ...base,
            id: 'ev-work-2',
            title: 'Work Shift',
            description: 'Gordon Library',
            eventType: 'recurring',
            days: ['T', 'R'],
            terms: ['C'],
            startTime: { hours: 13, minutes: 0 },
            endTime: { hours: 15, minutes: 0 },
          },
          {
            ...base,
            id: 'ev-standup',
            title: 'Standup',
            eventType: 'recurring',
            days: ['M'],
            terms: ['A', 'B', 'C', 'D'],
            startTime: { hours: 8, minutes: 0 },
            endTime: { hours: 8, minutes: 30 },
          },
          {
            ...base,
            id: 'ev-dentist',
            title: 'Dentist',
            eventType: 'one-time',
            date: '2026-11-11',
            startTime: { hours: 14, minutes: 0 },
            endTime: { hours: 15, minutes: 0 },
          },
        ],
      },
      'calendar-event',
    );
  });
}

const manager = (page: Page) =>
  page.locator('[data-modal-type="calendar-events"]');
const editor = (page: Page) => page.locator('[data-modal-type="local-event"]');
const confirm = (page: Page) => page.locator('[data-modal-type="confirm"]');
const eventRows = (page: Page) => manager(page).locator('[data-event-row]');
const blocks = (page: Page, term: string) =>
  page.locator(`[data-term="${term}"] .external-event-block`);

async function openManager(page: Page): Promise<void> {
  await page.click('#calendar-events-btn');
  await expect(manager(page)).toBeVisible();
}

async function savedEvent(page: Page, id: string) {
  return page.evaluate(
    eventId =>
      (window as any).services.profileStateManager
        .getActiveSchedule()
        .localEvents.find((e: any) => e.id === eventId),
    id,
  );
}

test('lists recurring events first, then one-time ones, with edit actions', async ({
  page,
}) => {
  await openSchedule(page);
  await seedEvents(page);
  await openManager(page);

  await expect(eventRows(page)).toHaveCount(4);
  // Recurring by title then start time, one-time last.
  expect(
    await eventRows(page).evaluateAll(els =>
      els.map(el => el.getAttribute('data-title')),
    ),
  ).toEqual(['Standup', 'Work Shift', 'Work Shift', 'Dentist']);

  const standup = eventRows(page).nth(0);
  await expect(standup).toContainText('Mon');
  await expect(standup).toContainText('8:00-8:30 AM');
  await expect(standup.locator('[data-term-badge]')).toHaveText([
    'A',
    'B',
    'C',
    'D',
  ]);

  const work = eventRows(page).nth(1);
  await expect(work).toContainText('Mon, Wed');
  await expect(work).toContainText('9:00-11:00 AM');
  await expect(work.locator('[data-term-badge]')).toHaveText(['A', 'B']);
  await expect(eventRows(page).nth(2)).toContainText('Gordon Library');
  await expect(eventRows(page).nth(2)).toContainText('Tue, Thu');

  const dentist = eventRows(page).nth(3);
  await expect(dentist).toContainText('One-time');
  await expect(dentist).toContainText('Wed, Nov 11, 2026');
  await expect(dentist).toContainText('2:00-3:00 PM');
  await expect(dentist).toContainText('Not drawn on the weekly grids');
  await expect(dentist.locator('[data-term-badge]')).toHaveCount(0);
  await expect(dentist.getByRole('button', { name: /^Edit/ })).toBeVisible();

  // The one-time event is deletable from here.
  await dentist.getByRole('checkbox').check();
  await manager(page)
    .getByRole('button', { name: 'Delete selected (1)' })
    .click();
  await expect(confirm(page)).toContainText('"Dentist"');
  await confirm(page).getByRole('button', { name: 'Delete' }).click();
  await expect(eventRows(page)).toHaveCount(3);
});

test('editing an event keeps its id and moves its block', async ({ page }) => {
  await openSchedule(page);
  await seedEvents(page);
  const block = page
    .locator('[data-term="A"] .external-event-block[data-event-id="ev-work"]')
    .first();
  const before = await block.boundingBox();

  await openManager(page);
  await eventRows(page).nth(1).getByRole('button', { name: /^Edit/ }).click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).locator('#event-title')).toHaveValue('Work Shift');
  await editor(page).locator('#event-end').fill('13:00');
  await editor(page).getByRole('button', { name: 'Save Changes' }).click();
  await expect(editor(page)).toHaveCount(0);

  // Back on the list, which shows the new time.
  await expect(eventRows(page).nth(1)).toContainText('9:00 AM-1:00 PM');
  const saved = await savedEvent(page, 'ev-work');
  expect(saved.createdAt).toBe(1000);
  expect(saved.updatedAt).toBeGreaterThan(1000);
  expect(saved.endTime).toEqual(t(13));
  await page.keyboard.press('Escape');
  await expect(manager(page)).toHaveCount(0);

  const after = await block.boundingBox();
  expect(after!.height).toBeGreaterThan(before!.height);
});

test('Delete event in Edit names what it removes and closes both modals', async ({
  page,
}) => {
  await openSchedule(page);
  await seedEvents(page);
  await openManager(page);
  await eventRows(page).nth(0).getByRole('button', { name: /^Edit/ }).click();
  await editor(page).getByRole('button', { name: 'Delete event' }).click();
  await expect(confirm(page)).toContainText(
    'Delete "Standup" (Mon 8:00–8:30 AM · A, B, C, D)?',
  );
  await confirm(page).getByRole('button', { name: 'Delete' }).click();
  await expect(confirm(page)).toHaveCount(0);
  await expect(editor(page)).toHaveCount(0);
  await expect(eventRows(page)).toHaveCount(3);
  expect(await savedEvent(page, 'ev-standup')).toBeUndefined();
  // The row that opened Edit is gone; focus stays in the manager, not on the
  // page behind it.
  expect(
    await manager(page).evaluate(el => el.contains(document.activeElement)),
  ).toBe(true);
});

test('bulk delete is one undo step', async ({ page }) => {
  await openSchedule(page);
  await seedEvents(page);
  await openManager(page);

  const bulk = manager(page).getByRole('button', { name: /^Delete selected/ });
  await expect(bulk).toBeDisabled();
  await manager(page)
    .getByLabel(/events$/)
    .check();
  await expect(bulk).toHaveText('Delete selected (4)');
  await bulk.click();
  await expect(confirm(page)).toContainText('Delete 4 events?');
  await confirm(page).getByRole('button', { name: 'Delete' }).click();
  await expect(manager(page).locator('[data-empty]')).toBeVisible();
  // Focus moves once the confirm has finished closing.
  await expect
    .poll(() =>
      manager(page).evaluate(el => el.contains(document.activeElement)),
    )
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(manager(page)).toHaveCount(0);
  await expect(page.locator('.external-event-block')).toHaveCount(0);

  await page.click('#undo-btn');
  await expect(blocks(page, 'A')).toHaveCount(3);
  await openManager(page);
  await expect(eventRows(page)).toHaveCount(4);
});

test('clicking an event block on the grid opens Edit', async ({ page }) => {
  await openSchedule(page);
  await seedEvents(page);
  await page
    .locator('[data-term="C"] .external-event-block[data-event-id="ev-work-2"]')
    .first()
    .click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).locator('#event-title')).toHaveValue('Work Shift');
  await expect(editor(page).locator('#event-start')).toHaveValue('13:00');
  await expect(
    editor(page).getByRole('button', { name: 'Delete event' }),
  ).toBeVisible();
  await expect(confirm(page)).toHaveCount(0);
});

test('with no events the manager explains why to add some', async ({
  page,
}) => {
  await openSchedule(page);
  await openManager(page);
  const empty = manager(page).locator('[data-empty]');
  await expect(empty).toContainText('Auto-Schedule');
  await expect(
    manager(page).getByRole('button', { name: 'Add event' }),
  ).toBeVisible();

  // Add Event opens on top of the list; Escape peels it off again.
  await manager(page).getByRole('button', { name: 'Add event' }).click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page)).toContainText('Add Event');
  await expect(editor(page).getByText('Import from calendar')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(editor(page)).toHaveCount(0);
  await expect(manager(page)).toBeVisible();

  // Import opens on top, on its "choose a file" screen.
  await manager(page)
    .getByRole('button', { name: 'Import from calendar (.ics)' })
    .click();
  const imp = page.locator('[data-modal-type="ics-import"]');
  await expect(imp.getByText('Drop an .ics file here')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(imp).toHaveCount(0);
  await expect(manager(page)).toBeVisible();
});

test('a calendar file dropped on the manager opens the import', async ({
  page,
}) => {
  await openSchedule(page);
  await openManager(page);
  const text = readFileSync(FIXTURE, 'utf8');
  const dt = await page.evaluateHandle(content => {
    const data = new DataTransfer();
    data.items.add(new File(['junk'], 'notes.txt', { type: 'text/plain' }));
    data.items.add(
      new File([content], 'weekly-sample.ics', { type: 'text/calendar' }),
    );
    return data;
  }, text);
  const fire = (type: string) =>
    manager(page).dispatchEvent(type, { dataTransfer: dt });
  await fire('dragenter');
  await fire('dragover');
  await expect(
    manager(page).getByText('Drop to import calendar events'),
  ).toBeVisible();
  await fire('drop');
  const imp = page.locator('[data-modal-type="ics-import"]');
  // Several files: the .ics one is taken, not the first.
  await expect(
    imp.getByText(/Found 5 weekly events in weekly-sample.ics/),
  ).toBeVisible();
});

test('the manager fits a phone and its Calendar Events button lives in the drawer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openSchedule(page);
  await seedEvents(page);
  await page.getByRole('button', { name: /^Courses/ }).click();
  await page.getByRole('button', { name: /Calendar Events/ }).click();
  await expect(manager(page)).toBeVisible();
  await expect(eventRows(page)).toHaveCount(4);
  const overflow = await manager(page)
    .locator('.modal-dialog')
    .evaluate(el => el.scrollWidth > el.clientWidth);
  expect(overflow).toBe(false);
  await expect(
    manager(page).getByRole('button', { name: 'Add event' }),
  ).toBeInViewport();
});
