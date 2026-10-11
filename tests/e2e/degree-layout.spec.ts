import { test, expect, type Page } from './fixtures';
import { fileURLToPath } from 'node:url';

/**
 * The Degree page above phone width: one toolbar row, the Assign menu's
 * bucket progress, the To place list wherever the rail would stack, and the
 * Move sheet on touch screens of any size.
 */

const fixture = fileURLToPath(
  new URL('../fixtures/academic-progress-sample.xlsx', import.meta.url),
);

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
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  const warning = page.locator('[data-modal-type="degree-import-warning"]');
  await warning.getByRole('button', { name: 'Got it' }).click();
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

test.describe('at 1280x800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('search, status and layout share one toolbar row', async ({ page }) => {
    await setup(page);
    const centre = (sel: string) =>
      page.locator(sel).evaluate(e => {
        const r = e.getBoundingClientRect();
        return Math.round(r.top + r.height / 2);
      });
    const row = await centre('#degree-course-search');
    expect(await centre('.degree-filter-chip >> nth=0')).toBe(row);
    expect(await centre('#degree-view-grid')).toBe(row);

    // The legend explains only the bar colours; the cards' pills name status.
    await expect(page.locator('.degree-legend-item')).toHaveText([
      'Completed',
      'Planned',
      'Schedule',
    ]);
    // The total is the progress bar's label, not a fourth stat.
    await expect(page.locator('.degree-stat-label')).toHaveText([
      'Earned',
      'In progress',
      'Transfer',
    ]);
    await expect(page.locator('.degree-rail .course-badge')).toHaveCount(0);
  });

  test('the Assign menu shows each bucket’s progress and fits on screen', async ({
    page,
  }) => {
    await setup(page);
    await page.locator('.degree-rail .assign-menu-trigger').first().click();
    const popup = page.locator('.assign-menu-popup');
    await expect(popup).toBeVisible();

    // The first rail course has no room above it, so the menu drops down
    // rather than running under the app header.
    const header = (await page.locator('.app-header').boundingBox())!;
    const box = (await popup.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(header.y + header.height);

    await expect(
      popup.locator('.assign-menu-bucket', { hasText: 'Core' }),
    ).toContainText('credits left');
    // Degree-wide buckets are offered only while the page shows them.
    await expect(
      popup.locator('.assign-menu-bucket', { hasText: 'Total Credits' }),
    ).toHaveCount(0);
  });
});

test.describe('at 755x800', () => {
  test.use({ viewport: { width: 755, height: 800 } });

  test('unplaced courses are listed at the top instead of a stacked rail', async ({
    page,
  }) => {
    await setup(page);
    await expect(page.locator('.degree-rail')).toHaveCount(0);
    await expect(page.locator('.degree-to-place-row')).toHaveCount(2);

    await page.locator('.degree-to-place-row').first().click();
    const sheet = page.locator('[data-modal-type="move-course"]');
    await sheet.locator('.move-sheet-bucket', { hasText: 'Core' }).click();
    await expect(page.locator('.degree-to-place-row')).toHaveCount(1);
  });
});

test.describe('on a 1280x800 touch screen', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true });

  test('Assign opens the Move sheet, since touch cannot drag', async ({
    page,
  }) => {
    await setup(page);
    await page.locator('.degree-rail .assign-menu-trigger').first().tap();
    await expect(page.locator('[data-modal-type="move-course"]')).toBeVisible();
    await expect(page.locator('.assign-menu-popup')).toHaveCount(0);
    await expect(page.locator('.degree-rail-hint')).toContainText(
      'Assign button',
    );
  });
});
