import { test, expect, type Page } from '@playwright/test';

/**
 * Guards every tutorial step's "Find Element" target.
 *
 * Each step declares a CSS `selector`; the tutorial highlights it and the
 * "Find Element" button (animateFindDot) flies to it. If a selector goes stale
 * - e.g. a Svelte rewrite hashes a class or drops an id - the highlight silently
 * finds nothing. This test walks all registered tutorials end to end and asserts
 * that, for every step, the selector resolves to a visible element AND the
 * highlight SVG actually attaches (which also exercises the auto-reveal path for
 * off-screen, paginated targets).
 *
 * The walk is driven through the live TutorialService on `window.services`
 * rather than by synthetic clicks: each step carries its own ui/app-state, so
 * advancing with `nextStep()` reconstructs the DOM every step (the same
 * mechanism the tutorial's Back button relies on).
 */

interface StepResult {
  tutorial: string;
  index: number;
  title: string;
  selector: string;
  found: boolean;
  highlighted: boolean;
}

async function walkTutorials(page: Page): Promise<StepResult[]> {
  return page.evaluate(async () => {
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    const services = (window as any).services;
    const tutorial = services?.tutorial;
    if (!tutorial) throw new Error('window.services.tutorial not available');
    const svc = tutorial.service;

    const isVisible = (el: Element | null): boolean => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    const results: StepResult[] = [];
    // The wrapper start() runs sharedSetup (adds the TUT department + a tutorial
    // schedule). onComplete chains welcome -> filtering -> autoSchedule -> schedules,
    // so this single start walks all four tutorials.
    await tutorial.start('welcome');

    let guard = 0;
    let lastKey = '';
    while (guard++ < 120) {
      const active = svc.getActiveTutorial();
      if (!active) break;
      const index = svc.getCurrentStepIndex();
      const step = active.steps[index];
      const key = `${active.id}#${index}`;
      if (key === lastKey && guard > 110) break;

      let found = false;
      let highlighted = false;
      for (let poll = 0; poll < 35; poll++) {
        found = isVisible(document.querySelector(step.selector));
        highlighted = !!document.querySelector('.tutorial-highlight-svg');
        if (found && highlighted) break;
        await sleep(160);
      }
      if (key !== lastKey) {
        results.push({
          tutorial: active.id,
          index,
          title: step.title,
          selector: step.selector,
          found,
          highlighted,
        });
      }
      lastKey = key;

      svc.nextStep();
      await sleep(350);
    }
    return results;
  });
}

test('every tutorial step highlights a real, visible element', async ({
  page,
}) => {
  // Accept any incidental native dialog so the walk never hangs.
  page.on('dialog', d => d.accept('Tutorial').catch(() => {}));

  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).services?.tutorial, null, {
    timeout: 30_000,
  });

  const results = await walkTutorials(page);

  // Sanity: all four tutorials were walked (welcome 9 + filtering 14 + autoSchedule 10 + schedules 6 = 39).
  expect(results.length).toBeGreaterThanOrEqual(39);

  const broken = results.filter(r => !r.found || !r.highlighted);
  const report = broken
    .map(
      r =>
        `  ✗ ${r.tutorial}#${r.index} "${r.title}" -> ${r.selector}` +
        ` (found=${r.found}, highlighted=${r.highlighted})`,
    )
    .join('\n');
  expect(
    broken,
    `Tutorial steps whose target could not be found/highlighted:\n${report}`,
  ).toEqual([]);
});
