import { test, expect, type Page } from '@playwright/test';

/**
 * Term focus on the schedule page: one card zooms up to fill the pane, clicking
 * it zooms back out, and scrolling pages between terms while it is up.
 *
 * The zoom is a WAAPI box tween (termFocus.svelte.ts), so every geometry read
 * here has to wait the animation out - reading immediately would measure a card
 * mid-flight.
 */

// Longer than MORPH_MS/SLIDE_MS plus a frame or two of slack.
const SETTLE_MS = 450;

test.beforeEach(async ({ page }) => {
  // Skip the first-visit welcome tutorial so it doesn't overlay the flow.
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
});

async function setupSchedule(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate(async () => {
    const services = (window as any).services;
    const cs = services.courseDataService
      .getAllDepartments()
      .find((d: any) => d.abbreviation === 'CS');
    for (const course of cs.courses.slice(0, 6)) {
      await services.courseSelectionService.selectCourse(course);
      const section = course.lectures?.[0]?.section;
      if (section)
        await services.courseSelectionService.setSelectedSection(
          course,
          section.number,
        );
    }
  });
  await page.click('#schedule-tab');
  await expect(page.locator('.section-block').first()).toBeVisible();
}

const focusedTerm = (page: Page): Promise<string | null> =>
  page.locator('[data-terms-grid]').getAttribute('data-focused-term');

/** A card's box as a fraction of the pane it sits in. */
async function coverage(page: Page, term: string): Promise<number> {
  return page.evaluate(t => {
    const grid = document.querySelector('[data-terms-grid]')!;
    const card = grid.querySelector(`.term-graph[data-term="${t}"]`)!;
    const g = grid.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    return (c.width * c.height) / (g.width * g.height);
  }, term);
}

test('zooms a term up to the pane and back out on a second click', async ({
  page,
}) => {
  await setupSchedule(page);

  const card = page.locator('.term-graph[data-term="B"]');
  expect(await coverage(page, 'B')).toBeLessThan(0.4); // one cell of a 2x2

  await card.click({ position: { x: 5, y: 5 } });
  await expect(page.locator('[data-terms-grid]')).toHaveAttribute(
    'data-focused-term',
    'B',
  );
  await page.waitForTimeout(SETTLE_MS);
  expect(await coverage(page, 'B')).toBeGreaterThan(0.8);

  // Clicking the focused card is what zooms back out - there is no back button.
  await card.click({ position: { x: 5, y: 5 } });
  await expect(page.locator('[data-terms-grid]')).not.toHaveAttribute(
    'data-focused-term',
    'B',
  );
  await page.waitForTimeout(SETTLE_MS);
  expect(await coverage(page, 'B')).toBeLessThan(0.4);
});

test('scrolling pages through the terms and wraps D back to A', async ({
  page,
}) => {
  await setupSchedule(page);

  await page
    .locator('.term-graph[data-term="B"]')
    .click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(SETTLE_MS);

  await page.mouse.move(700, 500);
  for (const expected of ['C', 'D', 'A', 'B']) {
    await page.mouse.wheel(0, 120);
    await expect(page.locator('[data-terms-grid]')).toHaveAttribute(
      'data-focused-term',
      expected,
    );
    await page.waitForTimeout(SETTLE_MS);
  }

  await page.mouse.wheel(0, -120);
  await expect(page.locator('[data-terms-grid]')).toHaveAttribute(
    'data-focused-term',
    'A',
  );
});

/**
 * Section blocks stopPropagation so they open the section-info modal instead of
 * reaching the card's toggle - otherwise every block click would zoom out.
 */
test('clicking a section block opens its info rather than unfocusing', async ({
  page,
}) => {
  await setupSchedule(page);

  await page
    .locator('.term-graph[data-term="A"]')
    .click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(SETTLE_MS);

  await page
    .locator('.term-graph[data-term="A"] .section-block')
    .first()
    .click();

  await expect(page.locator('.section-info-modal')).toBeVisible();
  expect(await focusedTerm(page)).toBe('A');
});

test('escape exits term focus, arrows page between terms', async ({ page }) => {
  await setupSchedule(page);

  await page
    .locator('.term-graph[data-term="C"]')
    .click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(SETTLE_MS);

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-terms-grid]')).toHaveAttribute(
    'data-focused-term',
    'D',
  );
  await page.waitForTimeout(SETTLE_MS);

  await page.keyboard.press('Escape');
  expect(await focusedTerm(page)).toBeNull();
});

/**
 * The schedule page stays mounted behind display:none, so its key handler has to
 * ignore keys typed on another page - Escape used to unfocus a grid nobody could
 * see, and arrows would now swallow keystrokes there too.
 */
test('leaves keys alone while another page is showing', async ({ page }) => {
  await setupSchedule(page);

  await page
    .locator('.term-graph[data-term="B"]')
    .click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(SETTLE_MS);

  await page.click('#planner-tab');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown');

  expect(await focusedTerm(page)).toBe('B');
});
