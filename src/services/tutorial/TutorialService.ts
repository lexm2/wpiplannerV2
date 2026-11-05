import type {
  Tutorial,
  TutorialStep,
  TutorialState,
  ResolvedStep,
} from '../../types/tutorial';
import { stateAt } from './tutorialState';
import { getInlineSVG } from '../../utils/iconPaths';
import { tutorialOverlayState } from '../../svelte/tutorial/tutorialOverlayState.svelte';
import { courseListState } from '../../svelte/courseListState.svelte';
import { scrollParent } from '../../utils/scrollParent';
import { headerCollapsed } from '../../svelte/phoneLayout.svelte';
import { targetOnScreen } from '../../svelte/tutorial/floatingBox.position';
import { logger } from '../../utils/logger';

/**
 * Make the app match `state` (and show the step's drawer). Idempotent, and
 * checks `isStale` after anything it awaits so a step that has been overtaken
 * stops writing.
 */
type EstablishCallback = (
  state: TutorialState,
  step: ResolvedStep,
  isStale: () => boolean,
) => Promise<void>;

// A reading step points at Next, which the box always shows.
const NEXT_SELECTOR = '[data-tutorial-next]';

export class TutorialService {
  private tutorials: Map<string, Tutorial> = new Map();
  private activeTutorial: Tutorial | null = null;
  private currentStepIndex = 0;
  private establishCallback: EstablishCallback | null = null;
  private completionCallback: (() => void) | null = null;
  private exitCallback: (() => void) | null = null;
  private currentSelector: string | null = null;
  private svgOverlay: SVGSVGElement | null = null;
  private arrowOverlay: HTMLElement | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private positionFrame: number | null = null;
  private actionCleanup: (() => void) | null = null;
  private highlightObserver: MutationObserver | null = null;
  private aboutObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private layoutObserver: ResizeObserver | null = null;
  private svgContainer: HTMLElement | null = null;
  private originalPosition: string | null = null;
  private revealTimer: ReturnType<typeof setTimeout> | null = null;
  private settleTimers: ReturnType<typeof setTimeout>[] = [];
  // Bumped by every apply and teardown, so an apply still waiting on the app
  // can tell it has been overtaken.
  private applyRun = 0;

  constructor() {
    // The second half of a double-click lands after the step has moved on, where
    // it would undo the first (unpick the section just picked) or hit whatever
    // just opened under the pointer. Registered first, so it also keeps the next
    // step from counting it.
    document.body.addEventListener(
      'click',
      e => {
        if (this.activeTutorial && e.detail > 1) {
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      },
      { capture: true },
    );
  }

  register(tutorial: Tutorial): void {
    this.tutorials.set(tutorial.id, tutorial);
  }

  start(id: string): void {
    const tutorial = this.tutorials.get(id);
    if (!tutorial || tutorial.steps.length === 0) return;
    this.activeTutorial = tutorial;
    this.currentStepIndex = 0;
    void this.applyStep();
  }

  // Abandon the current tutorial and move on to the next one in the chain, as
  // if it had been completed.
  skipToNextTutorial(): void {
    this.cleanup();
    this.activeTutorial = null;
    tutorialOverlayState.set(null, 0, 0);
    this.completionCallback?.();
  }

  // Leave the tutorial system entirely - no further tutorial is started.
  exit(): void {
    this.cleanup();
    this.activeTutorial = null;
    tutorialOverlayState.set(null, 0, 0);
    this.exitCallback?.();
  }

  cancel(): void {
    this.cleanup();
    this.activeTutorial = null;
    tutorialOverlayState.set(null, 0, 0);
  }

  nextStep(): void {
    if (!this.activeTutorial) return;
    this.cleanup();
    this.currentStepIndex++;
    if (this.currentStepIndex >= this.activeTutorial.steps.length) {
      this.activeTutorial = null;
      tutorialOverlayState.set(null, 0, 0);
      this.completionCallback?.();
    } else {
      void this.applyStep();
    }
  }

  // Arrives the way every other path does: the previous step's state is
  // established from scratch, with nothing remembered about how it was left.
  async goBack(): Promise<void> {
    if (!this.activeTutorial || this.currentStepIndex <= 0) return;
    this.cleanup();
    this.currentStepIndex--;
    await this.applyStep();
  }

  /**
   * Put the current step back on screen, for a student who closed its window,
   * wandered to another page or scrolled away. `force` re-applies it even if
   * its target looks fine, for a breakpoint change that moves things around
   * (a drawer still sliding out reads as on screen).
   */
  relocate(force = false): void {
    const step = this.getCurrentStep();
    if (!step) return;
    if (
      !force &&
      step.selector === this.currentSelector &&
      targetOnScreen(step.selector) &&
      (!step.about || targetOnScreen(step.about))
    ) {
      return;
    }
    this.cleanup();
    void this.applyStep();
  }

  getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  /** The running step as it applies at the current window width. */
  getCurrentStep(): ResolvedStep | null {
    const step = this.activeTutorial?.steps[this.currentStepIndex];
    return step ? this.resolveStep(step) : null;
  }

  /** What the app must look like at the running step. */
  getRequiredState(): TutorialState | null {
    return this.activeTutorial
      ? stateAt(this.activeTutorial, this.currentStepIndex)
      : null;
  }

  getActiveTutorial(): Tutorial | null {
    return this.activeTutorial;
  }

  onEstablish(cb: EstablishCallback): void {
    this.establishCallback = cb;
  }

  onComplete(cb: () => void): void {
    this.completionCallback = cb;
  }

  onExit(cb: () => void): void {
    this.exitCallback = cb;
  }

  disarmCurrentListener(): void {
    this.actionCleanup?.();
    this.actionCleanup = null;
  }

  private async applyStep(): Promise<void> {
    const tutorial = this.activeTutorial;
    if (!tutorial) return;
    const index = this.currentStepIndex;
    const run = ++this.applyRun;
    const step = this.resolveStep(tutorial.steps[index]);
    try {
      await this.establishCallback?.(
        stateAt(tutorial, index),
        step,
        () => run !== this.applyRun,
      );
    } catch (error) {
      logger.error('Tutorial step could not be set up:', error);
      return;
    }
    // Exited, skipped, or moved on while the app caught up - this step is
    // stale, and drawing it would leak its overlay into whatever came next.
    if (run !== this.applyRun) return;
    this.highlightElement(step.selector, step.scrollArrow ?? false);
    if (step.about) this.revealAbout(step.about);
    // A fresh object each time, so the box re-seats itself on a re-apply too.
    tutorialOverlayState.set({ ...step }, index, tutorial.steps.length);
    if (step.waitFor === 'click') this.listenForAction(step);
  }

  // The step as it applies at the current window width.
  private resolveStep(step: TutorialStep): ResolvedStep {
    if (step.waitFor === 'manual') {
      return {
        title: step.title,
        description: step.description,
        waitFor: 'manual',
        selector: NEXT_SELECTOR,
        about: step.about,
        drawer: step.drawer,
      };
    }
    return {
      title: step.title,
      description: step.description,
      waitFor: 'click',
      selector: step.selector,
      waitForSelector: step.waitForSelector,
      scrollArrow: step.scrollArrow,
      drawer: step.drawer,
      ...(headerCollapsed.current ? step.compact : undefined),
    };
  }

  private highlightElement(selector: string, scrollArrow: boolean): void {
    this.currentSelector = selector;
    this.removeHighlight();
    this.highlightObserver?.disconnect();
    this.highlightObserver = null;
    this.stopReveal();

    const el = document.querySelector(selector);
    if (el) {
      this.attachTo(el, selector, scrollArrow);
      return;
    }

    // Target isn't in the DOM yet - observe for it to mount while actively
    // revealing it (rows past the rendered window, off-screen rows). There is
    // no deadline: a target that mounts late still gets its highlight.
    this.highlightObserver = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (!found) return;
      this.highlightObserver!.disconnect();
      this.highlightObserver = null;
      this.stopReveal();
      this.attachTo(found, selector, scrollArrow);
    });
    this.highlightObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    this.startReveal(selector);
  }

  private attachTo(el: Element, selector: string, scrollArrow: boolean): void {
    // Next sits in the box, which is always on screen.
    if (selector !== NEXT_SELECTOR) this.revealAndSettle(el);
    this.attachSvgOverlay(el, scrollArrow);
  }

  // What a reading step describes may still be mounting (a window opening), so
  // wait for it rather than give up.
  private revealAbout(selector: string): void {
    this.aboutObserver?.disconnect();
    this.aboutObserver = null;
    const el = document.querySelector(selector);
    if (el) {
      this.revealAndSettle(el);
      return;
    }
    this.aboutObserver = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (!found) return;
      this.aboutObserver!.disconnect();
      this.aboutObserver = null;
      this.revealAndSettle(found);
    });
    this.aboutObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // A step's own transition can still be moving things when its target lands
  // (a wizard mounting, a drawer sliding in, cards reflowing), so look again
  // once it has settled.
  private revealAndSettle(el: Element): void {
    this.revealInView(el);
    this.clearSettleTimers();
    this.settleTimers = [300, 800].map(ms =>
      setTimeout(() => {
        if (el.isConnected) this.revealInView(el);
      }, ms),
    );
  }

  private clearSettleTimers(): void {
    this.settleTimers.forEach(clearTimeout);
    this.settleTimers = [];
  }

  // Scroll a found target into view if the window or its own scroll container
  // cuts it off, so the highlight (and the user) land on it. The SVG overlay is
  // a child of the target's container, so it follows this scroll. A target on a
  // page the step's own transition just switched to is in the DOM but still
  // display:none, where scrolling does nothing - so wait until it has a box.
  private revealInView(el: Element): void {
    this.layoutObserver?.disconnect();
    this.layoutObserver = null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      this.layoutObserver = new ResizeObserver(() => {
        const box = el.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) return;
        this.layoutObserver?.disconnect();
        this.layoutObserver = null;
        this.revealInView(el);
      });
      this.layoutObserver.observe(el);
      return;
    }
    const scroller = scrollParent(el).getBoundingClientRect();
    const top = Math.max(scroller.top, 0);
    const bottom = Math.min(scroller.bottom, window.innerHeight);
    const cutOff = r.top < top || r.bottom > bottom;
    // A target taller than its container can't fit however it scrolls.
    if (cutOff && r.height <= bottom - top) {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  }

  // While a step's target is missing, page the course list forward until it
  // mounts. Stops as soon as the target appears (the highlight MutationObserver
  // attaches and revealInView scrolls to it) or the step changes. Grows the
  // cursor directly rather than scrolling the container - scrolling arbitrary
  // containers races with wizard/modal render.
  private startReveal(selector: string): void {
    let attempts = 0;
    const tick = () => {
      this.revealTimer = null;
      if (this.currentSelector !== selector) return;
      if (document.querySelector(selector)) return;
      if (attempts++ >= 40) return;
      courseListState.showMore();
      this.revealTimer = setTimeout(tick, 200);
    };
    tick();
  }

  private stopReveal(): void {
    if (this.revealTimer !== null) {
      clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }
  }

  private attachSvgOverlay(el: Element, scrollArrow: boolean): void {
    this.svgOverlay?.remove();
    this.arrowOverlay?.remove();
    this.intersectionObserver?.disconnect();
    this.resizeObserver?.disconnect();
    if (this.positionFrame !== null) {
      cancelAnimationFrame(this.positionFrame);
      this.positionFrame = null;
    }

    // The highlight is always a child of its target, so it moves and resizes
    // with it; every target is a control or a container, never a void element.
    const htmlEl = el as HTMLElement;

    this.originalPosition = htmlEl.style.position;
    if (getComputedStyle(htmlEl).position === 'static')
      htmlEl.style.position = 'relative';
    this.svgContainer = htmlEl;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('tutorial-highlight-svg');

    const rectEl = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'rect',
    );
    rectEl.setAttribute('x', '1');
    rectEl.setAttribute('y', '1');
    rectEl.setAttribute('rx', '6');
    rectEl.setAttribute('fill', 'none');
    rectEl.setAttribute('stroke-width', '2');
    rectEl.setAttribute('stroke-dasharray', '8 6');

    svg.appendChild(rectEl);
    htmlEl.appendChild(svg);
    this.svgOverlay = svg;

    const updateSize = () => {
      if (htmlEl.offsetWidth === 0 || htmlEl.offsetHeight === 0) return;
      const cs = getComputedStyle(htmlEl);
      // The overlay is a child of the target, so a target that clips its own
      // overflow (a scrolling list) would hide one drawn outside its edge.
      // Read here because overflow can change at a breakpoint.
      const pad = cs.overflow !== 'visible' ? -2 : 5;
      const w = htmlEl.offsetWidth + pad * 2;
      const h = htmlEl.offsetHeight + pad * 2;
      const borderTop = parseFloat(cs.borderTopWidth) || 0;
      const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
      svg.style.top = `${-(pad + borderTop)}px`;
      svg.style.left = `${-(pad + borderLeft)}px`;
      svg.setAttribute('width', String(w));
      svg.setAttribute('height', String(h));
      rectEl.setAttribute('width', String(w - 2));
      rectEl.setAttribute('height', String(h - 2));
    };
    this.resizeObserver = new ResizeObserver(updateSize);
    this.resizeObserver.observe(el);
    updateSize();

    let arrow: HTMLElement | null = null;
    if (scrollArrow) {
      arrow = document.createElement('div');
      arrow.classList.add('tutorial-scroll-arrow');
      arrow.innerHTML = getInlineSVG(
        'CHEVRON_DOWN',
        'tutorial-scroll-arrow-icon',
      );
      document.body.appendChild(arrow);
      this.arrowOverlay = arrow;
    }

    // Track the target's viewport intersection: re-sync the box on re-entry
    // (layout can shift while it's off-screen) and, when a scroll arrow is
    // shown, point it toward the off-screen target.
    this.intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          updateSize();
          svg.style.visibility = '';
          arrow?.removeAttribute('data-direction');
        } else if (arrow) {
          svg.style.visibility = 'hidden';
          const r = entry.boundingClientRect;
          const cr = scrollParent(el).getBoundingClientRect();
          const elCY = r.top + r.height / 2;
          arrow.dataset.direction =
            elCY < cr.top + cr.height / 2 ? 'up' : 'down';
        }
      },
      { threshold: 0 },
    );
    this.intersectionObserver.observe(el);

    this.highlightObserver = new MutationObserver(() => {
      if (el.isConnected && this.svgOverlay?.isConnected) return;
      this.highlightObserver!.disconnect();
      this.highlightObserver = null;
      this.removeHighlight();
      if (this.currentSelector)
        this.highlightElement(this.currentSelector, scrollArrow);
    });
    this.highlightObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private removeHighlight(): void {
    this.svgOverlay?.remove();
    this.svgOverlay = null;
    this.arrowOverlay?.remove();
    this.arrowOverlay = null;
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.positionFrame !== null) {
      cancelAnimationFrame(this.positionFrame);
      this.positionFrame = null;
    }
    if (this.svgContainer) {
      this.svgContainer.style.position = this.originalPosition ?? '';
      this.svgContainer = null;
      this.originalPosition = null;
    }
  }

  private listenForAction(step: ResolvedStep): void {
    const selector = step.waitForSelector ?? step.selector;
    const run = this.applyRun;
    const handler = (e: Event) => {
      if (!(e.target as Element).closest?.(selector)) return;
      this.disarmCurrentListener();
      // After the app's own handler (and a label's activation of its input) have
      // run: the next step then sets the state it needs on top of theirs, instead
      // of racing them.
      setTimeout(() => {
        if (run === this.applyRun) this.nextStep();
      }, 0);
    };
    document.body.addEventListener('click', handler, { capture: true });
    this.actionCleanup = () =>
      document.body.removeEventListener('click', handler, { capture: true });
  }

  private cleanup(): void {
    this.applyRun++;
    this.clearSettleTimers();
    this.currentSelector = null;
    this.layoutObserver?.disconnect();
    this.layoutObserver = null;
    this.removeHighlight();
    this.stopReveal();
    this.highlightObserver?.disconnect();
    this.highlightObserver = null;
    this.aboutObserver?.disconnect();
    this.aboutObserver = null;
    this.actionCleanup?.();
    this.actionCleanup = null;
  }
}
