import { test, expect, type Page } from './fixtures';
import { waitForTutorialState } from './tutorialExpect';

/**
 * Guards every tutorial step's "Find Element" target, and that arriving at a
 * step puts the app in the state the step requires.
 *
 * Each step declares a CSS `selector`; the tutorial highlights it and the
 * "Find Element" button (animateFindDot) flies to it. If a selector goes stale
 * - e.g. a Svelte rewrite hashes a class or drops an id - the highlight silently
 * finds nothing. This test walks all registered tutorials end to end and asserts
 * that, for every step, the selector resolves to a visible element AND the
 * highlight SVG actually attaches (which also exercises the auto-reveal path for
 * targets past the course list's rendered window).
 *
 * The walk is driven through the live TutorialService on `window.services`
 * rather than by synthetic clicks, so every step is reached the way the box's
 * Next button reaches it: nothing but the tutorial's own state rule sets the
 * app up. After each advance the app is compared with `getRequiredState()`.
 */

interface StepResult {
  tutorial: string;
  index: number;
  title: string;
  selector: string;
  found: boolean;
  highlighted: boolean;
  mismatches: string[];
}

async function currentStep(page: Page) {
  return page.evaluate(() => {
    const svc = (window as any).services.tutorial.service;
    const active = svc.getActiveTutorial();
    const step = svc.getCurrentStep();
    return active && step
      ? {
          tutorial: active.id as string,
          index: svc.getCurrentStepIndex() as number,
          title: step.title as string,
          selector: step.selector as string,
        }
      : null;
  });
}

async function targetReady(
  page: Page,
  selector: string,
): Promise<{ found: boolean; highlighted: boolean }> {
  return page.evaluate(async sel => {
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    let found = false;
    let highlighted = false;
    for (let poll = 0; poll < 35; poll++) {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      found = !!r && r.width > 0 && r.height > 0;
      highlighted = !!document.querySelector('.tutorial-highlight-svg');
      if (found && highlighted) break;
      await sleep(160);
    }
    return { found, highlighted };
  }, selector);
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

  const expectedSteps = await page.evaluate(() => {
    const svc = (window as any).services.tutorial.service;
    return ([...svc.tutorials.values()] as Array<{ steps: unknown[] }>).reduce(
      (n, t) => n + t.steps.length,
      0,
    );
  });

  // The wrapper start() runs sharedSetup (adds the TUT department + a tutorial
  // schedule). onComplete chains welcome -> filtering -> autoSchedule -> schedules,
  // so this single start walks all four tutorials.
  await page.evaluate(() => (window as any).services.tutorial.start('welcome'));

  const results: StepResult[] = [];
  let lastKey = '';
  for (let guard = 0; guard < expectedSteps + 20; guard++) {
    const step = await currentStep(page);
    if (!step) break;
    const key = `${step.tutorial}#${step.index}`;
    if (key !== lastKey) {
      const { found, highlighted } = await targetReady(page, step.selector);
      const mismatches = await waitForTutorialState(page);
      results.push({ ...step, found, highlighted, mismatches });
    }
    lastKey = key;

    await page.evaluate(() =>
      (window as any).services.tutorial.service.nextStep(),
    );
    await page.waitForTimeout(350);
  }

  expect(results.length).toBe(expectedSteps);

  const broken = results.filter(
    r => !r.found || !r.highlighted || r.mismatches.length > 0,
  );
  const report = broken
    .map(
      r =>
        `  x ${r.tutorial}#${r.index} "${r.title}" -> ${r.selector}` +
        ` (found=${r.found}, highlighted=${r.highlighted})` +
        r.mismatches.map(m => `\n      ${m}`).join(''),
    )
    .join('\n');
  expect(
    broken,
    `Tutorial steps whose target could not be found/highlighted, or whose app state was wrong:\n${report}`,
  ).toEqual([]);
});
