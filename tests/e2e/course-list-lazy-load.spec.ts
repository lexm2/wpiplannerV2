import { test, expect, type Page } from '@playwright/test';

/**
 * Guards the course list's scroll-driven paging.
 *
 * The sentinel's IntersectionObserver must take the scrolling ancestor as its
 * `root`; against the viewport it stays clipped and the next page never
 * arrives. That fails silently - the list just stops at 100.
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
  // "All Departments" is the first entry, and the only one with enough courses
  // to page more than once.
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

  // Run to the end; the cap is a runaway guard, not a real bound.
  for (let i = 0; i < 40 && (await sentinel(page).count()) > 0; i++) {
    await scrollToBottom(page);
    await page.waitForTimeout(250);
  }

  // Exhausted: sentinel gone, every course rendered, footer drops "Showing N of".
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

  // Await each page - scrolling to a bottom that hasn't moved is a no-op.
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
  // Non-vacuous only if the search matches more than a page.
  expect(lastNumber((await footer.textContent())!)).toBeGreaterThan(300);
});
