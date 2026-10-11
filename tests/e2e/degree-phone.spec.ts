import { test, expect, type Page } from './fixtures';
import { fileURLToPath } from 'node:url';

/**
 * The Degree page on a phone. Touch can't drag a course, so placing one goes
 * through the Move sheet; the Unassigned rail becomes the To place list at the
 * top of the page, the summary folds to one line, and the filters hide behind
 * a button beside the search bar.
 *
 * Firefox has no `isMobile`, so a phone is a 390x844 touch viewport with an
 * iPhone user agent, as in narrow-layout.spec.ts.
 */

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const fixture = fileURLToPath(
  new URL('../fixtures/academic-progress-sample.xlsx', import.meta.url),
);

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  userAgent: IPHONE_UA,
});

/** Load the app, import the fixture, and put two courses in the schedule. */
async function setup(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
  await page.locator('#degree-tab').tap();
  await page.setInputFiles('#degree-import-file', fixture);
  const warning = page.locator('[data-modal-type="degree-import-warning"]');
  await warning.getByRole('button', { name: 'Got it' }).tap();
  await warning.waitFor({ state: 'detached' });
  await page.evaluate(async () => {
    const s = (window as any).services;
    const deps = s.courseDataService.getAllDepartments();
    for (const n of ['1004', '2102']) {
      const course = deps
        .find((d: any) => d.abbreviation === 'CS')
        .courses.find((c: any) => c.number === n);
      await s.courseSelectionService.selectCourse(course);
    }
  });
}

test('unplaced courses are listed at the top, not in a rail', async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator('.degree-rail')).toHaveCount(0);
  const list = page.locator('#degree-to-place');
  await expect(list.locator('.degree-to-place-count')).toHaveText('2');
  await expect(list.locator('.degree-to-place-row')).toHaveCount(2);

  // Its count also sits in the bottom bar's left slot.
  const barButton = page.locator('.drawer-toggle-to-place');
  await expect(barButton).toBeVisible();
  await expect(barButton.locator('.drawer-toggle-count')).toHaveText('2');
});

test('tapping a course places it through the Move sheet', async ({ page }) => {
  await setup(page);
  await page.locator('.degree-to-place-row').first().tap();

  const sheet = page.locator('[data-modal-type="move-course"]');
  await expect(sheet).toBeVisible();
  // The sheet reaches the bottom of the screen and fits on it.
  // (Polled: it rises into place.)
  const dialog = sheet.locator('.modal-dialog');
  await expect
    .poll(async () => {
      const box = (await dialog.boundingBox())!;
      return box.y >= 0 && Math.round(box.y + box.height);
    })
    .toBe(844);

  await sheet.locator('.move-sheet-bucket', { hasText: 'Core' }).tap();
  await expect(sheet).toHaveCount(0);

  const core = page.locator('.requirement-card', { hasText: 'Core' });
  await expect(core.locator('.requirement-course-tap.is-schedule')).toHaveCount(
    1,
  );
  await expect(page.locator('.degree-to-place-row')).toHaveCount(1);

  // From the bucket, the same sheet moves it on or takes it back out.
  await core.locator('.requirement-course-tap.is-schedule').tap();
  await expect(
    sheet.locator('.move-sheet-bucket.is-current', { hasText: 'Core' }),
  ).toBeDisabled();
  await sheet.getByRole('button', { name: 'Remove from bucket' }).tap();
  await expect(page.locator('.degree-to-place-row')).toHaveCount(2);
});

test('the summary folds to one line, with its actions in a menu', async ({
  page,
}) => {
  await setup(page);
  const summary = page.locator('.degree-summary');
  expect((await summary.boundingBox())!.height).toBeLessThan(100);
  await expect(summary.locator('.degree-credit-stats')).toHaveCount(0);

  await summary.locator('.degree-summary-toggle').tap();
  await expect(summary.locator('.degree-credit-stats')).toBeVisible();

  await page.locator('#degree-summary-more-btn').tap();
  await page.locator('#degree-configure-buckets-btn').tap();
  await expect(page.locator('[data-modal-type="bucket-config"]')).toBeVisible();
});

test('filters live behind one button, and phones open on Grid', async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator('.degree-progress-legend')).toHaveCount(0);
  await expect(page.locator('.degree-filter-row')).toHaveCount(0);

  await page.locator('#degree-filter-btn').tap();
  await expect(page.locator('#degree-view-grid')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('.degree-filter-chip', { hasText: 'Not satisfied' }).tap();
  await expect(page.locator('#degree-filter-btn')).toHaveClass(/active/);
});

test('every phone control is at least 40px tall', async ({ page }) => {
  await setup(page);
  await page.locator('#degree-filter-btn').tap();
  const short = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '#degree-page button:not(.requirement-course-link)',
      ),
    ]
      .filter(b => b.offsetParent && b.getBoundingClientRect().height < 40)
      .map(
        b => `${b.className}: ${Math.round(b.getBoundingClientRect().height)}`,
      ),
  );
  expect(short).toEqual([]);
});
