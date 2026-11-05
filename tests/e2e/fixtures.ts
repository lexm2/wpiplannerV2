import { test as base, expect, type Page } from '@playwright/test';

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
    // appModuleUrl reads resource timing, which stops recording once its buffer
    // fills. The app was at 242 of the 250-entry default, so raise it well clear.
    await page.addInitScript(() =>
      performance.setResourceTimingBufferSize(2000),
    );

    await use(page);

    expect(unexpected, 'console warnings or errors during the test').toEqual(
      [],
    );
  },
});

/**
 * Resolve a source module's URL from the page's OWN module graph.
 *
 * Tests that poke at app internals must import the exact module instance the
 * mounted app uses. A dev server that has served an HMR update stamps every
 * import specifier with a `?t=<timestamp>` cache-bust query, so importing the
 * bare path loads a SECOND copy of the module -- with its own `$state`
 * singletons -- that no mounted component ever reads. Since
 * playwright.config.ts reuses an already-running dev server, that is the
 * normal local case, not an edge case. Looking the URL up from resource timing
 * gets whichever form the app actually loaded.
 */
export async function appModuleUrl(page: Page, path: string): Promise<string> {
  const url = await page.evaluate(p => {
    return (
      performance
        .getEntriesByType('resource')
        .map(e => e.name)
        .find(n => n.includes(p)) ?? null
    );
  }, path);
  // Deliberately no bare-path fallback: importing the bare path is exactly the
  // bug this helper exists to prevent, and it fails SILENTLY (the detached copy
  // accepts every mutation, so state-only assertions still pass). Fail loudly.
  if (!url) {
    throw new Error(
      `${path} is not in the page's module graph, so its live instance cannot ` +
        `be addressed. If the app grew past the resource-timing buffer, raise the ` +
        `size in the page fixture.`,
    );
  }
  return url;
}

export { expect };
export type { Download, Locator, Page } from '@playwright/test';
