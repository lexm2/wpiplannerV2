import { test } from './fixtures';

/** The console guard in fixtures.ts: these pin down that it actually bites. */

test('a stray console warning fails the test', async ({ page }) => {
  test.fail();
  await page.goto('about:blank');
  await page.evaluate(() => console.warn('unexpected warning'));
});

test('an uncaught page error fails the test', async ({ page }) => {
  test.fail();
  await page.goto('about:blank');
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('uncaught');
    });
  });
  await page.waitForTimeout(100);
});

test.describe('declared messages', () => {
  test.use({ expectedConsole: /expected warning/ });

  test('a declared message passes', async ({ page }) => {
    await page.goto('about:blank');
    await page.evaluate(() => console.warn('an expected warning'));
  });
});
