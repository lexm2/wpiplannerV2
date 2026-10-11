import { test as base, expect } from '@playwright/test';

/**
 * Every spec imports `test` and `expect` from here instead of
 * @playwright/test. The page fixture records console warnings and errors, and
 * uncaught page errors, and fails the test if any were logged: a Svelte
 * runtime warning or a stray logger.error is a bug even when the assertions
 * pass.
 *
 * A test that provokes one on purpose (a bad import file, a boot failure)
 * lists the messages it expects with `test.use({ expectedConsole: /a|b/ })`
 * (one pattern: Playwright reads an array option as [value, options]);
 * anything else still fails.
 */
export const test = base.extend<{ expectedConsole: RegExp | undefined }>({
  expectedConsole: [undefined, { option: true }],

  page: async ({ page, expectedConsole }, use) => {
    const unexpected: string[] = [];
    const record = (kind: string, text: string) => {
      // Playwright's own Firefox instrumentation reports aborted requests on
      // reload as console errors; they are not the app's.
      if (text.includes('chrome://juggler/')) return;
      if (!expectedConsole?.test(text)) {
        unexpected.push(`${kind}: ${text}`);
      }
    };
    page.on('console', msg => {
      const type = msg.type();
      if (type === 'warning' || type === 'error') record(type, msg.text());
    });
    page.on('pageerror', error => record('pageerror', error.message));

    await use(page);

    expect(unexpected, 'console warnings or errors during the test').toEqual(
      [],
    );
  },
});

export { expect };
export type { Download, Locator, Page } from '@playwright/test';
