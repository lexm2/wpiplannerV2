import { test, expect, type Page } from '@playwright/test';

/**
 * Walks all four tutorials the way a user does - by really clicking the element
 * each step points at - and asserts every step actually works.
 *
 * This is the companion to tutorial-highlight.spec.ts. That test advances with
 * `svc.nextStep()`, which exercises the state-reconstruction path (what the Back
 * button relies on) but never proves a real click does anything. Here nothing is
 * advanced programmatically: the walk only moves forward because a genuine
 * pointer event on the step's own target fired TutorialService's `waitFor`
 * listener. A step that highlights a decoration, a duplicated id, or a target
 * buried under a modal fails here and passes there.
 *
 * Per step it checks:
 *   - the selector matches exactly one element (a second match means the
 *     highlight's `querySelector` can silently pick the wrong one)
 *   - that element is laid out and visible
 *   - the highlight SVG attached to that element (not merely somewhere) and
 *     overlaps it
 *   - `elementFromPoint` at the click point resolves back through `closest()` to
 *     the selector - i.e. the exact test TutorialService.listenForAction runs, so
 *     a click really will register
 *   - the click advances the tutorial to the next step
 *
 * Failures are collected rather than thrown, so one broken step reports every
 * other broken step with it instead of masking them.
 */

interface StepMeta {
  tutorial: string;
  index: number;
  total: number;
  title: string;
  selector: string;
  waitFor: string;
}

interface StepProbe {
  matches: number;
  visible: boolean;
  highlighted: boolean;
  highlightOwned: boolean;
  highlightOverlaps: boolean;
  blockedBy: string | null;
}

type StepReport = StepMeta &
  StepProbe & { advanced: boolean; clickError: string | null };

const STEP_KEY = (m: StepMeta | null) =>
  m ? `${m.tutorial}#${m.index}` : 'done';

// welcome 9 + filtering 14 + autoSchedule 10 + schedules 6.
const EXPECTED_STEPS = 39;

async function readStep(page: Page): Promise<StepMeta | null> {
  return page.evaluate(() => {
    const svc = (window as any).services?.tutorial?.service;
    const active = svc?.getActiveTutorial();
    if (!active) return null;
    const index = svc.getCurrentStepIndex();
    const step = active.steps[index];
    if (!step) return null;
    return {
      tutorial: active.id,
      index,
      total: active.steps.length,
      title: step.title,
      selector: step.selector,
      waitFor: step.waitFor,
    };
  });
}

async function probeStep(page: Page, selector: string): Promise<StepProbe> {
  return page.evaluate(async sel => {
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    const describe = (el: Element | null): string => {
      if (!el) return 'nothing (outside the document)';
      const id = el.id ? `#${el.id}` : '';
      const cls =
        typeof el.className === 'string' && el.className.trim()
          ? `.${el.className.trim().split(/\s+/).join('.')}`
          : '';
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };
    const overlaps = (a: DOMRect, b: DOMRect) =>
      !(
        a.right <= b.left ||
        a.left >= b.right ||
        a.bottom <= b.top ||
        a.top >= b.bottom
      );

    // The DOM is rebuilt on every transition (page swap, modal open, wizard
    // mount), and the highlight attaches via MutationObserver once the target
    // lands - so poll for both rather than sampling once.
    let el: Element | null = null;
    let svg: Element | null = null;
    for (let poll = 0; poll < 40; poll++) {
      el = document.querySelector(sel);
      svg = document.querySelector('.tutorial-highlight-svg');
      if (el && el.getBoundingClientRect().width > 0 && svg) break;
      await sleep(150);
    }

    const matches = document.querySelectorAll(sel).length;
    if (!el) {
      return {
        matches: 0,
        visible: false,
        highlighted: !!svg,
        highlightOwned: false,
        highlightOverlaps: false,
        blockedBy: null,
      };
    }

    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none';

    // attachSvgOverlay appends the SVG to the target itself, or to the
    // target's parent when the target is a void element that can't hold
    // children. Anything else means the highlight is drawn on the wrong box.
    const svgParent = svg?.parentElement ?? null;
    const highlightOwned =
      !!svgParent && (svgParent === el || svgParent === el.parentElement);
    const highlightOverlaps =
      !!svg && overlaps(svg.getBoundingClientRect(), rect);

    // Would a real click register? listenForAction matches with
    // `e.target.closest(selector)`, so run exactly that against whatever is
    // actually painted at the click point.
    el.scrollIntoView({ block: 'center', inline: 'center' });
    await sleep(150);
    const hit = el.getBoundingClientRect();
    const x = Math.min(
      Math.max(hit.left + hit.width / 2, 1),
      window.innerWidth - 1,
    );
    const y = Math.min(
      Math.max(hit.top + hit.height / 2, 1),
      window.innerHeight - 1,
    );
    const atPoint = document.elementFromPoint(x, y);
    const registers = !!atPoint?.closest(sel);

    return {
      matches,
      visible,
      highlighted: !!svg,
      highlightOwned,
      highlightOverlaps,
      blockedBy: registers ? null : describe(atPoint),
    };
  }, selector);
}

async function forceAdvance(page: Page): Promise<void> {
  await page.evaluate(() => {
    const svc = (window as any).services?.tutorial?.service;
    svc?.disarmCurrentListener();
    svc?.nextStep();
  });
}

async function waitForAdvance(
  page: Page,
  from: string,
  timeoutMs = 12_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (STEP_KEY(await readStep(page)) !== from) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

test('every tutorial step can be completed by clicking its own target', async ({
  page,
}) => {
  // Nothing should raise a native dialog, but accept any so the walk can't hang.
  page.on('dialog', d => d.accept('Tutorial E2E').catch(() => {}));

  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).services?.tutorial, null, {
    timeout: 30_000,
  });

  // No explicit start(): a first visit (no `wpi_visited` key in a fresh
  // context) auto-starts 'welcome' from AppBootstrap.startApp, and onComplete
  // chains filtering → autoSchedule → schedules. Waiting on it guards that
  // first-visit path too.
  await page.waitForFunction(
    () =>
      (window as any).services.tutorial.service.getActiveTutorial()?.id ===
      'welcome',
    null,
    { timeout: 30_000 },
  );

  const results: StepReport[] = [];
  for (let guard = 0; guard < 60; guard++) {
    const meta = await readStep(page);
    if (!meta) break;

    const probe = await probeStep(page, meta.selector);

    // Manual steps are completed with the floating box's Next button; every
    // other step must be completed by clicking the highlighted target itself.
    const clickSelector =
      meta.waitFor === 'manual' ? '[data-tutorial-next]' : meta.selector;
    let clickError: string | null = null;
    try {
      await page.locator(clickSelector).first().click({ timeout: 5_000 });
    } catch (e) {
      clickError = (e as Error).message.split('\n')[0];
    }

    const advanced = clickError
      ? false
      : await waitForAdvance(page, STEP_KEY(meta));
    results.push({ ...meta, ...probe, advanced, clickError });

    // Keep walking so one broken step reports the rest instead of hiding them.
    if (!advanced) {
      await forceAdvance(page);
      await page.waitForTimeout(400);
    }
  }

  const broken = results.filter(
    r =>
      r.matches !== 1 ||
      !r.visible ||
      !r.highlighted ||
      !r.highlightOwned ||
      !r.highlightOverlaps ||
      r.blockedBy !== null ||
      !r.advanced,
  );
  const report = broken
    .map(r => {
      const why: string[] = [];
      if (r.matches === 0) why.push('selector matched no element');
      if (r.matches > 1)
        why.push(
          `selector matched ${r.matches} elements (highlight picks the first)`,
        );
      if (r.matches >= 1 && !r.visible) why.push('element is not visible');
      if (!r.highlighted) why.push('no highlight SVG rendered');
      if (r.highlighted && !r.highlightOwned)
        why.push('highlight SVG attached to a different element');
      if (r.highlighted && r.highlightOwned && !r.highlightOverlaps)
        why.push('highlight SVG does not overlap the target');
      if (r.blockedBy) why.push(`click point hits ${r.blockedBy}`);
      if (!r.advanced)
        why.push(
          `clicking it did not advance the tutorial${r.clickError ? ` (${r.clickError})` : ''}`,
        );
      return `  ✗ ${r.tutorial}#${r.index} "${r.title}" → ${r.selector}\n      ${why.join('\n      ')}`;
    })
    .join('\n');

  expect(
    broken,
    `Tutorial steps that a user could not complete:\n${report}`,
  ).toEqual([]);
  expect(
    results.length,
    'all four tutorials should have been walked end to end',
  ).toBe(EXPECTED_STEPS);

  // Finishing the last tutorial must hand the app back the way it found it:
  // cleanupTutorial drops the synthetic TUT department and the throwaway
  // Tutorial schedule, and marks the visit so it never auto-starts again.
  const after = await page.evaluate(() => {
    const s = (window as any).services;
    return {
      visited: localStorage.getItem('wpi_visited'),
      tutDepartments: s.courseDataService
        .getAllDepartments()
        .filter((d: any) => d.abbreviation === 'TUT').length,
      tutorialSchedules: s.scheduleManagementService
        .getAllSchedules()
        .filter(
          (sc: any) =>
            sc.name === 'Tutorial' || sc.name.startsWith('Tutorial ('),
        ).length,
    };
  });
  expect(
    after,
    'the finished tutorial should have cleaned up after itself',
  ).toEqual({
    visited: 'true',
    tutDepartments: 0,
    tutorialSchedules: 0,
  });
});
