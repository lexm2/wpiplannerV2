import { readFileSync } from 'node:fs';
import { test, expect, type Page } from './fixtures';

/**
 * Importing an .ics calendar as weekly custom events: the Calendar Events ->
 * "Import from calendar" flow, the results list, one-step undo, the
 * "Already added" marking on a re-import, and dropping the file on the grids.
 */

const FIXTURE = 'tests/fixtures/ics/weekly-sample.ics';

test.beforeEach(async ({ page }) => {
  // Skip the first-visit welcome tutorial so it doesn't overlay the flow.
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
  // Pin "now" so the schedule's academic year is 2026 whenever this runs.
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

const manager = (page: Page) =>
  page.locator('[data-modal-type="calendar-events"]');
const importModal = (page: Page) =>
  page.locator('[data-modal-type="ics-import"]');

/** Calendar Events -> Import from calendar (.ics) -> Choose file. */
async function importViaPicker(
  page: Page,
  file: string | { name: string; mimeType: string; buffer: Buffer } = FIXTURE,
): Promise<void> {
  await page.click('#calendar-events-btn');
  await page
    .getByRole('button', { name: 'Import from calendar (.ics)' })
    .click();
  const chooser = page.waitForEvent('filechooser');
  await importModal(page)
    .getByRole('button', { name: 'Choose file', exact: true })
    .click();
  await (await chooser).setFiles(file);
}

/** Closes the manager (the top modal once an import has closed). */
async function closeManager(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(manager(page)).toHaveCount(0);
}

const rows = (page: Page) => page.locator('[data-candidate]');
const blocks = (page: Page, term: string) =>
  page.locator(`[data-term="${term}"] .external-event-block`);

async function blockTitles(page: Page, term: string): Promise<string[]> {
  return blocks(page, term).evaluateAll(els =>
    els.map(el => (el.getAttribute('title') ?? '').split('\n')[0]),
  );
}

async function expectGridsAfterImport(page: Page): Promise<void> {
  // Gym (B) was unchecked: A has Study Group, Tutoring M W, Work Shift M W;
  // B has Tutoring M and Work Shift M W; C and D stay empty.
  await expect(blocks(page, 'A')).toHaveCount(5);
  await expect(blocks(page, 'B')).toHaveCount(3);
  await expect(blocks(page, 'C')).toHaveCount(0);
  await expect(blocks(page, 'D')).toHaveCount(0);
  expect((await blockTitles(page, 'A')).sort()).toEqual(
    ['Study Group', 'Tutoring', 'Tutoring', 'Work Shift', 'Work Shift'].sort(),
  );
  expect((await blockTitles(page, 'B')).sort()).toEqual(
    ['Tutoring', 'Work Shift', 'Work Shift'].sort(),
  );
}

test('imports weekly events from an .ics file, undoes it in one step, and flags repeats', async ({
  page,
}) => {
  await openSchedule(page);
  await expect(blocks(page, 'A')).toHaveCount(0);

  await importViaPicker(page);

  const dialog = importModal(page);
  await expect(dialog.getByText('Import Calendar')).toBeVisible();
  await expect(dialog.getByText(/Found 5 weekly events in/)).toContainText(
    'weekly-sample.ics for the 2026–27 terms',
  );

  // The five weekly events, in order, with where each one lands.
  await expect(rows(page)).toHaveCount(5);
  const expected: Array<{
    title: string;
    days: string;
    time: string;
    terms: string[];
    location?: string;
  }> = [
    { title: 'Gym', days: 'Fri', time: '7:00-8:00 AM', terms: ['B'] },
    { title: 'Study Group', days: 'Tue', time: '6:00-7:30 PM', terms: ['A'] },
    { title: 'Tutoring', days: 'Mon, Wed', time: '3:00-4:00 PM', terms: ['A'] },
    { title: 'Tutoring', days: 'Mon', time: '3:00-4:00 PM', terms: ['B'] },
    {
      title: 'Work Shift',
      days: 'Mon, Wed',
      time: '9:00-11:00 AM',
      terms: ['A', 'B'],
      location: 'Gordon Library',
    },
  ];
  for (const [i, e] of expected.entries()) {
    const row = rows(page).nth(i);
    await expect(row).toContainText(e.title);
    await expect(row).toContainText(e.days);
    await expect(row).toContainText(e.time);
    if (e.location) await expect(row).toContainText(e.location);
    await expect(row.locator('[data-term-badge]')).toHaveText(e.terms);
    await expect(row.getByRole('checkbox')).toBeChecked();
  }

  // What was left out sits right under the "Found" line, with the titles.
  const skipped = dialog.locator('[data-skipped] summary');
  await expect(skipped).toContainText('3 not weekly for 30% of a term');
  await expect(skipped).toContainText('1 with weekend meetings left off');
  await expect(skipped).toContainText('1 not during the 2026–27 terms');
  await expect(skipped).toContainText('1 all-day');
  await expect(skipped).toContainText('1 cancelled');
  await expect(
    dialog.getByText(/in at least 30% of a term's weeks/),
  ).toBeVisible();
  await skipped.click();
  const occasional = dialog.locator('[data-skip-reason="occasional"]');
  for (const title of ['Career Fair', 'Club Meeting', 'Dentist']) {
    await expect(occasional).toContainText(title);
  }
  await expect(dialog.locator('[data-skip-reason="cancelled"]')).toContainText(
    'Old Lab',
  );
  await skipped.click();

  // Uncheck Gym, add the rest.
  await rows(page).first().getByRole('checkbox').uncheck();
  const add = dialog.getByRole('button', { name: 'Add 4 events' });
  await expect(add).toBeEnabled();
  await add.click();
  await expect(dialog).toBeHidden();

  // The manager underneath now lists what was added.
  await expect(manager(page).locator('[data-event-row]')).toHaveCount(4);
  await closeManager(page);

  await expectGridsAfterImport(page);

  // The whole import is one undo step (and redo brings it back).
  await expect(page.locator('#undo-btn')).toBeEnabled();
  await page.click('#undo-btn');
  await expect(page.locator('.external-event-block')).toHaveCount(0);
  await page.click('#redo-btn');
  await expectGridsAfterImport(page);

  // Persisted.
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
  await page.click('#schedule-tab');
  await expectGridsAfterImport(page);

  // Importing the same file again: what is already there is marked and locked.
  await importViaPicker(page);
  await expect(rows(page)).toHaveCount(5);
  for (const i of [1, 2, 3, 4]) {
    const row = rows(page).nth(i);
    await expect(row).toContainText('Already added');
    await expect(row.getByRole('checkbox')).toBeDisabled();
    await expect(row.getByRole('checkbox')).not.toBeChecked();
  }
  const gym = rows(page).first();
  await expect(gym).not.toContainText('Already added');
  await expect(gym.getByRole('checkbox')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Add 1 event' })).toBeEnabled();
});

test('only the part of an event not on the schedule yet is offered', async ({
  page,
}) => {
  await openSchedule(page);

  // Hand-add Work Shift, Monday and Wednesday 9-11, on term B only.
  await page.click('#calendar-events-btn');
  await manager(page).getByRole('button', { name: 'Add event' }).click();
  const form = page.locator('[data-modal-type="local-event"]');
  await form.locator('#event-title').fill('Work Shift');
  await form.locator('button[title="Wednesday"]').click();
  for (const term of ['A', 'C', 'D']) {
    await form.locator(`input[name="terms"][value="${term}"]`).uncheck();
  }
  await form.locator('#event-end').fill('11:00');
  await form.getByRole('button', { name: 'Add Event' }).click();
  await expect(form).toHaveCount(0);
  await expect(manager(page).locator('[data-event-row]')).toHaveCount(1);
  await closeManager(page);

  await importViaPicker(page);
  const shift = rows(page).filter({ hasText: 'Work Shift' });
  await expect(shift).toHaveCount(1);
  await expect(shift).toContainText('Partly added');
  await expect(shift.locator('[data-term-badge]')).toHaveText(['A']);
  await expect(shift).toContainText('Mon, Wed');
  await expect(shift.getByRole('checkbox')).toBeChecked();

  // Only the missing term is added: B keeps exactly its two hand-made blocks.
  await importModal(page)
    .getByRole('button', { name: /^Add 5 events$/ })
    .click();
  await expect(importModal(page)).toHaveCount(0);
  await closeManager(page);
  await expect(blocks(page, 'B')).toHaveCount(4);
  expect(
    (await blockTitles(page, 'A')).filter(t => t.includes('Work Shift')),
  ).toHaveLength(2);
});

test('an event named like a catalog course starts unchecked', async ({
  page,
}) => {
  await openSchedule(page);
  const code = await page.evaluate(() => {
    const course = (window as any).services.courseDataService
      .getAllDepartments()
      .flatMap((d: any) => d.courses)
      .find((c: any) => /^[A-Z]{2,4}$/.test(c.departmentAbbr));
    return `${course.departmentAbbr} ${course.number}`;
  });
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    'BEGIN:VEVENT',
    'UID:course-like@example.com',
    'DTSTART;TZID=America/New_York:20260901T140000',
    'DTEND;TZID=America/New_York:20260901T150000',
    'RRULE:FREQ=WEEKLY;UNTIL=20261030T035959Z;BYDAY=TU',
    `SUMMARY:${code} Lecture`,
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:plain@example.com',
    'DTSTART;TZID=America/New_York:20260902T180000',
    'DTEND;TZID=America/New_York:20260902T190000',
    'RRULE:FREQ=WEEKLY;UNTIL=20261030T035959Z;BYDAY=WE',
    'SUMMARY:Choir',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
  await importViaPicker(page, {
    name: 'mixed.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(ics),
  });

  const course = rows(page).filter({ hasText: `${code} Lecture` });
  await expect(course).toContainText('Looks like a course');
  await expect(course).toContainText('Classes');
  await expect(course.getByRole('checkbox')).not.toBeChecked();
  await expect(
    rows(page).filter({ hasText: 'Choir' }).getByRole('checkbox'),
  ).toBeChecked();
  await expect(
    importModal(page).getByRole('button', { name: 'Add 1 event' }),
  ).toBeEnabled();

  // Still checkable.
  await course.getByRole('checkbox').check();
  await expect(
    importModal(page).getByRole('button', { name: 'Add 2 events' }),
  ).toBeEnabled();
});

test('Ctrl+Z with the import preview open leaves the schedule alone', async ({
  page,
}) => {
  await openSchedule(page);
  await importViaPicker(page);
  await importModal(page)
    .getByRole('button', { name: /^Add 5 events$/ })
    .click();
  await closeManager(page);
  await expect(blocks(page, 'A')).toHaveCount(5);

  await importViaPicker(page);
  await expect(rows(page).first().getByRole('checkbox')).toBeDisabled();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  // Nothing was undone: the rows are still "Already added".
  await expect(importModal(page)).toContainText('Nothing new to add');
  await expect(
    importModal(page).getByRole('button', { name: 'Nothing new to add' }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(blocks(page, 'A')).toHaveCount(5);
});

test('a file that is not a calendar is explained in the modal, not the console', async ({
  page,
}) => {
  await openSchedule(page);
  await importViaPicker(page, {
    name: 'notes.ics',
    mimeType: 'text/plain',
    buffer: Buffer.from('just some text'),
  });
  await expect(page.getByRole('alert')).toContainText('calendar');
  await expect(page.getByText('Drop an .ics file here')).toBeVisible();
});

test('dropping an .ics file on the schedule opens the import', async ({
  page,
}) => {
  await openSchedule(page);
  const text = readFileSync(FIXTURE, 'utf8');
  const main = page.locator('.schedule-main');

  // A drag carrying files shows the overlay; one without files does not.
  const dt = await page.evaluateHandle(content => {
    const data = new DataTransfer();
    data.items.add(
      new File([content], 'weekly-sample.ics', { type: 'text/calendar' }),
    );
    return data;
  }, text);
  const fire = (type: string) => main.dispatchEvent(type, { dataTransfer: dt });

  await fire('dragenter');
  await fire('dragover');
  await expect(page.getByText('Drop to import calendar events')).toBeVisible();
  await fire('drop');
  await expect(page.getByText('Drop to import calendar events')).toBeHidden();

  const dialog = importModal(page);
  await expect(dialog.getByText(/Found 5 weekly events/)).toBeVisible();
  await expect(rows(page)).toHaveCount(5);
});
