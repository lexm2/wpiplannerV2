import { test, expect, type Page } from '@playwright/test';

/**
 * Narrow windows and phones. Below 1250px the header collapses everything but
 * the settings gear, and below 1024px the schedule sidebar is hidden, so the
 * controls that remain have to stay reachable.
 *
 * Firefox has no `isMobile`, so a phone is a 390x844 touch viewport with an
 * iPhone user agent - which is what flips `html.is-mobile` on.
 */

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PHONE = { width: 390, height: 844 };

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
  // A phone UA gets the one-off "Mobile Not Supported" notice first.
  const notice = page.getByRole('button', { name: 'Got it' });
  if (await notice.isVisible()) await notice.click();
}

/** The element a tap at the centre of `selector` would actually land on. */
async function hitTargetAtCentre(page: Page, selector: string) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel)!;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    return {
      ok: !!hit && (hit === el || el.contains(hit)),
      hit: hit ? `${hit.tagName}#${hit.id}.${hit.className}` : null,
    };
  }, selector);
}

for (const device of ['phone UA', 'desktop UA'] as const) {
  test.describe(`at 390x844 with a ${device}`, () => {
    test.use({
      viewport: PHONE,
      hasTouch: device === 'phone UA',
      ...(device === 'phone UA' ? { userAgent: IPHONE_UA } : {}),
    });

    test('the settings gear is the hit target and opens its menu', async ({
      page,
    }) => {
      await boot(page);
      expect(
        await page.evaluate(() =>
          document.documentElement.classList.contains('is-mobile'),
        ),
      ).toBe(device === 'phone UA');

      const gear = page.locator('.settings-menu-btn');
      await expect(gear).toBeVisible();
      const gearHit = await hitTargetAtCentre(page, '.settings-menu-btn');
      expect(gearHit.ok, `gear covered by ${gearHit.hit}`).toBe(true);

      // No force: Playwright refuses the click if another element is on top.
      await gear.click({ timeout: 5000 });
      await expect(page.locator('.settings-dropdown-menu')).toBeVisible();

      // Every page tab must stay tappable too.
      for (const tab of ['#planner-tab', '#schedule-tab', '#degree-tab']) {
        const tabHit = await hitTargetAtCentre(page, tab);
        expect(tabHit.ok, `${tab} covered by ${tabHit.hit}`).toBe(true);
      }
    });
  });
}
