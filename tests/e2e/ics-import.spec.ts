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

/** Calendar Events -> Import from calendar (.ics) -> choose the fixture. */
async function importViaPicker(page: Page): Promise<void> {
  await page.click('#calendar-events-btn');
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: 'Import from calendar (.ics)' })
    .click();
  await (await chooser).setFiles(FIXTURE);
}

const rows = (page: Page) => page.locator('[data-candidate]');
const blocks = (page: Page, term: string) =>
  page.locator(`[data-term="${term}"] .external-event-block`);

async function blockTitles(page: Page, term: string): Promise<string[]> {
  return blocks(page, term).evaluateAll(els =>
    els.map(el => el.getAttribute('title') ?? ''),
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

  const dialog = page.getByRole('dialog');
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

  const skipped = dialog.getByText(/^Not added:/);
  await expect(skipped).toContainText('3 occasional');
  await expect(skipped).toContainText('1 weekend');
  await expect(skipped).toContainText('1 not during the 2026–27 terms');
  await expect(skipped).toContainText('1 all-day');
  await expect(skipped).toContainText('1 cancelled');

  // Uncheck Gym, add the rest.
  await rows(page).first().getByRole('checkbox').uncheck();
  const add = dialog.getByRole('button', { name: 'Add 4 events' });
  await expect(add).toBeEnabled();
  await add.click();
  await expect(dialog).toBeHidden();

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

test('a file that is not a calendar is explained in the modal, not the console', async ({
  page,
}) => {
  await openSchedule(page);
  await page.click('#calendar-events-btn');
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: 'Import from calendar (.ics)' })
    .click();
  await (
    await chooser
  ).setFiles({
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

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Found 5 weekly events/)).toBeVisible();
  await expect(rows(page)).toHaveCount(5);
});
