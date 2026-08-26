import { test, expect, type Page } from '@playwright/test';

/**
 * Guards the course list's scroll-driven paging.
 *
 * The list renders 100 courses at a time and extends itself when its sentinel
 * comes within a screenful of the bottom of #course-container. That sentinel is
 * watched by an IntersectionObserver whose `root` must be the scrolling
 * ancestor: left on the default viewport root it would still be clipped by the
 * container, the rootMargin would buy nothing, and the second page would simply
 * never arrive. Nothing about that is a compile error and nothing throws - the
 * list just quietly stops at 100 - which is what this test is for.
 */

const rows = (page: Page) => page.locator('[data-course-item]');
const sentinel = (page: Page) => page.locator('[data-load-sentinel]');

function scrollToBottom(page: Page): Promise<void> {
  return page.locator('#course-container').evaluate(el => {
    el.scrollTop = el.scrollHeight;
  });
}

/** The digits out of "Showing 200 of 1,287 courses" / "1,287 courses". */
function lastNumber(text: string): number {
  const groups = text.match(/[\d,]+/g);
  return Number(groups![groups!.length - 1].replace(/,/g, ''));
}

test('the course list pages itself as it is scrolled', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.waitForSelector('#course-container');
  // "All Departments" is the first entry, and the only one holding enough
  // courses to page more than once.
  await page.locator('.department-item').first().click();

  const footer = page.locator('[data-list-footer]');
  await expect(footer).toHaveText(/^Showing 100 of [\d,]+ courses$/);
  await expect(rows(page)).toHaveCount(100);

  const total = lastNumber((await footer.textContent())!);
  expect(total).toBeGreaterThan(100);

  // The whole point: no click, just scroll.
  await scrollToBottom(page);
  await expect(rows(page)).toHaveCount(200);
  await expect(footer).toHaveText(/^Showing 200 of [\d,]+ courses$/);

  // Run to the end. Each pass adds a page, so this needs at most total/100
  // rounds; the cap is a runaway guard, not a real bound.
  for (let i = 0; i < 40 && (await sentinel(page).count()) > 0; i++) {
    await scrollToBottom(page);
    await page.waitForTimeout(250);
  }

  // Exhausted: the sentinel is gone, every course is rendered, and the footer
  // drops the "Showing N of" now that there is nothing left to show.
  await expect(sentinel(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(total);
  await expect(footer).toHaveText(/^[\d,]+ courses$/);
  expect(lastNumber((await footer.textContent())!)).toBe(total);
});

test('a new result set restarts at the first page', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.waitForSelector('#course-container');
  await page.locator('.department-item').first().click();
  await expect(rows(page)).toHaveCount(100);

  // Await each page before scrolling again - scrolling to a bottom that hasn't
  // moved yet is a no-op, not a second trigger.
  await scrollToBottom(page);
  await expect(rows(page)).toHaveCount(200);
  await scrollToBottom(page);
  await expect(rows(page)).toHaveCount(300);

  // Searching after scrolling deep must not render every match in one frame.
  await page.locator('#course-container').evaluate(el => {
    el.scrollTop = 0;
  });
  await page
    .locator('.search-field input, .content-controls input')
    .first()
    .fill('a');

  const footer = page.locator('[data-list-footer]');
  await expect(footer).toHaveText(/^Showing 100 of [\d,]+ courses$/);
  await expect(rows(page)).toHaveCount(100);
  // Non-vacuous only if the search still matches more than a page: without the
  // reset those extra matches would all have rendered against the old cursor.
  expect(lastNumber((await footer.textContent())!)).toBeGreaterThan(300);
});
