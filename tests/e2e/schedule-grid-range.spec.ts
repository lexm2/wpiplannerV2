import { test, expect, type Page, type Locator } from './fixtures';

/**
 * The schedule grid's time range follows the schedule: 8 AM-8 PM by default,
 * widened to whole hours when a shown section starts earlier or ends later, so
 * no block is clamped to the grid edge.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
});

type Pick = 'earliest' | 'latest' | 'ordinary';

/**
 * Selects a catalog section that meets on a weekday - the one starting
 * earliest, the one ending latest, or the first lecture inside 8 AM-8 PM - and
 * returns where it renders. A discussion is selected with its lecture, which
 * cannot reach further than the extreme section itself.
 */
async function selectSection(page: Page, pick: Pick) {
  const found = await page.evaluate(async (which: Pick) => {
    const services = (window as any).services;
    const bounds = (s: any) => {
      const spans = s.periods
        .filter(
          (p: any) =>
            !p.isAsync && [...p.days].some((d: string) => 'MTWRF'.includes(d)),
        )
        .map((p: any) => ({
          startMin: p.startTime.hours * 60 + p.startTime.minutes,
          endMin: p.endTime.hours * 60 + p.endTime.minutes,
        }))
        .filter((t: any) => t.endMin > t.startMin);
      if (spans.length === 0) return null;
      return {
        startMin: Math.min(...spans.map((t: any) => t.startMin)),
        endMin: Math.max(...spans.map((t: any) => t.endMin)),
      };
    };

    let best: any = null;
    for (const dept of services.courseDataService.getAllDepartments()) {
      for (const course of dept.courses) {
        for (const lg of course.lectures ?? []) {
          for (const section of [lg.section, ...lg.compatibleDiscussions]) {
            const b = bounds(section);
            if (!b) continue;
            const better =
              which === 'earliest'
                ? !best || b.startMin < best.startMin
                : which === 'latest'
                  ? !best || b.endMin > best.endMin
                  : !best &&
                    section === lg.section &&
                    b.startMin >= 480 &&
                    b.endMin <= 1200;
            if (better) best = { course, lg, section, ...b };
          }
        }
      }
    }
    if (!best) return null;

    const { course, lg, section } = best;
    await services.courseSelectionService.selectCourse(course);
    await services.courseSelectionService.setSelectedComponents(
      course,
      section === lg.section
        ? { lecture: section }
        : { lecture: lg.section, discussion: section },
    );
    return {
      number: section.number as string,
      term: section.computedTerm as string,
      startMin: best.startMin as number,
      endMin: best.endMin as number,
    };
  }, pick);
  if (!found) throw new Error(`no ${pick} section in the catalog`);
  await page.click('#schedule-tab');
  // A semester section shows in both of its quarters; either will do.
  const term = { F: 'A', S: 'C', E: 'A' }[found.term] ?? found.term;
  const card = page.locator(`.term-graph[data-term="${term}"]`);
  const block = card
    .locator(`.section-block[data-section-number="${found.number}"]`)
    .first();
  await expect(block).toBeVisible();
  return { ...found, card, block };
}

function hourText(min: number): string {
  const h = Math.floor(min / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
}

/** Viewport y of `min` on the card's time axis, read off its hour labels. */
async function yOf(card: Locator, min: number): Promise<number> {
  const label = card.locator('.time-label', {
    hasText: new RegExp(`^${hourText(min)}$`),
  });
  await expect(label).toHaveCount(1);
  const box = (await label.boundingBox())!;
  return box.y + (box.height * (min % 60)) / 60;
}

const labels = (card: Locator) =>
  card.locator('.time-label:not(.term-letter-label)').allTextContents();

test('an ordinary schedule keeps the 8 AM-8 PM grid', async ({ page }) => {
  const { card } = await selectSection(page, 'ordinary');
  const text = await labels(card);
  expect(text[0]).toBe('8:00 AM');
  expect(text.at(-1)).toBe('7:00 PM');
  expect(text).toHaveLength(12);
});

test('a section before 8 AM widens the grid and starts on its hour', async ({
  page,
}) => {
  const { card, block, startMin } = await selectSection(page, 'earliest');
  expect(startMin).toBeLessThan(480); // the catalog has 6:00 AM discussions
  expect((await labels(card))[0]).toBe(hourText(startMin));

  const top = (await block.boundingBox())!.y;
  expect(Math.abs(top - (await yOf(card, startMin)))).toBeLessThanOrEqual(2);
});

test('a section ending after 8 PM is drawn to its end, not clipped', async ({
  page,
}) => {
  const { card, block, endMin } = await selectSection(page, 'latest');
  expect(endMin).toBeGreaterThan(1200); // and 6:00-8:50 PM classes
  const box = (await block.boundingBox())!;
  const bottom = box.y + box.height;
  expect(Math.abs(bottom - (await yOf(card, endMin)))).toBeLessThanOrEqual(2);
  expect((await labels(card)).at(-1)).toBe(hourText(endMin - 1));
});

test('every term shares one time axis', async ({ page }) => {
  // One early section in one term widens all four grids alike, so side-by-side
  // terms line up hour for hour and paging between them keeps the same axis.
  const { startMin } = await selectSection(page, 'earliest');
  const axes = await Promise.all(
    ['A', 'B', 'C', 'D'].map(term =>
      labels(page.locator(`.term-graph[data-term="${term}"]`)),
    ),
  );
  expect(axes[0][0]).toBe(hourText(startMin));
  for (const axis of axes.slice(1)) expect(axis).toEqual(axes[0]);
});
