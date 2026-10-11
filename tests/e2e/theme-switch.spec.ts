import { test, expect, type Page } from './fixtures';

/**
 * Guards the cost of a theme swap.
 *
 * reset.css gives every element a color transition, so a swap used to start
 * one CSS transition per element - thousands once the course list has paged
 * in a few hundred rows - and recalc and repaint all of them every frame of
 * the fade. ThemeManager now holds `theme-switching` on <html> while the new
 * colors land, so none start; any fade is a view transition on the compositor.
 */

async function pageInRows(page: Page, count: number): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#course-container');
  // "All Departments": the only entry with enough courses to page.
  await page.locator('.department-item').first().click();
  const rows = page.locator('[data-course-item]');
  for (let shown = 100; shown < count; shown += 100) {
    await page.locator('#course-container').evaluate(el => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(rows).toHaveCount(shown + 100);
  }
}

/**
 * Switches theme, then over the next frames records the most CSS transitions
 * running at once, and whether the view-transition crossfade ran.
 */
function switchAndWatch(page: Page, themeId: string) {
  return page.evaluate(async id => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    (window as any).services.themeManager.setTheme(id);
    let transitions = 0;
    let crossfade = false;
    for (let i = 0; i < 10; i++) {
      await frame();
      const running = document.getAnimations();
      transitions = Math.max(
        transitions,
        running.filter(a => a instanceof CSSTransition).length,
      );
      crossfade ||= running.some(a =>
        (a.effect as KeyframeEffect | null)?.pseudoElement?.startsWith(
          '::view-transition',
        ),
      );
    }
    return { transitions, crossfade };
  }, themeId);
}

async function themeLanded(page: Page, themeId: string): Promise<void> {
  await expect(page.locator('body')).toHaveClass(
    new RegExp(`\\btheme-${themeId}\\b`),
  );
  await expect(page.locator('html')).not.toHaveClass(/\btheme-switching\b/);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('a theme swap starts no CSS transitions, however many rows are mounted', async ({
  page,
}) => {
  await pageInRows(page, 300);

  expect(await switchAndWatch(page, 'wpi-light')).toEqual({
    transitions: 0,
    crossfade: true,
  });
  await themeLanded(page, 'wpi-light');
  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-background')
      .trim(),
  );
  expect(bg).toBe('#ffffff');

  // And back, so the dark -> light direction isn't the only one covered.
  expect(await switchAndWatch(page, 'wpi-dark')).toEqual({
    transitions: 0,
    crossfade: true,
  });
  await themeLanded(page, 'wpi-dark');
});

test('rapid toggles settle on the last theme with transitions re-enabled', async ({
  page,
}) => {
  await pageInRows(page, 100);

  await page.evaluate(() => {
    const tm = (window as any).services.themeManager;
    tm.setTheme('wpi-light');
    tm.setTheme('wpi-classic');
    tm.setTheme('high-contrast');
    tm.setTheme('wpi-light');
  });

  await themeLanded(page, 'wpi-light');
  await expect(page.locator('body')).not.toHaveClass(
    /\btheme-(wpi-dark|wpi-classic|high-contrast)\b/,
  );
});

test.describe('with reduced motion', () => {
  test('the swap is instant, with no crossfade', async ({ page }) => {
    // emulateMedia, not test.use({ reducedMotion }): Firefox's matchMedia
    // doesn't see the context option.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await pageInRows(page, 100);

    const landedSync = await page.evaluate(() => {
      (window as any).services.themeManager.setTheme('wpi-light');
      // No view transition: the new theme is applied before setTheme returns.
      return document.body.classList.contains('theme-wpi-light');
    });
    expect(landedSync).toBe(true);
    await themeLanded(page, 'wpi-light');
  });
});
