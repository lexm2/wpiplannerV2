import type {
  Tutorial,
  TutorialStep,
  TutorialAppState,
} from '../../types/tutorial';
import { getInlineSVG } from '../../utils/iconPaths';
import { tutorialOverlayState } from '../../svelte/tutorial/tutorialOverlayState.svelte';
import { courseListState } from '../../svelte/courseListState.svelte';
import { scrollParent } from '../../utils/scrollParent';

import type { UIState } from '../../types/uiState';
import { logger } from '../../utils/logger';

type StepApplyCallback = (index: number) => void;
type UIStateTransitionCallback = (uiState: Partial<UIState>) => void;
type AppStateTransitionCallback = (appState: TutorialAppState) => Promise<void>;
type PostTransitionCallback = (appState: TutorialAppState | undefined) => void;

export class TutorialService {
  private tutorials: Map<string, Tutorial> = new Map();
  private activeTutorial: Tutorial | null = null;
  private currentStepIndex = 0;
  private stepApplyCallback: StepApplyCallback | null = null;
  private completionCallback: (() => void) | null = null;
  private currentSelector: string | null = null;
  private svgOverlay: SVGSVGElement | null = null;
  private arrowOverlay: HTMLElement | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private positionFrame: number | null = null;
  private actionCleanup: (() => void) | null = null;
  private highlightObserver: MutationObserver | null = null;
  private actionObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private svgContainer: HTMLElement | null = null;
  private originalPosition: string | null = null;
  private uiStateTransitionCallback: UIStateTransitionCallback | null = null;
  private appStateTransitionCallback: AppStateTransitionCallback | null = null;
  private postTransitionCallback: PostTransitionCallback | null = null;
  private suppressAutoAdvance = false;
  private highlightTimeout: ReturnType<typeof setTimeout> | null = null;
  private actionTimeout: ReturnType<typeof setTimeout> | null = null;
  private revealTimer: ReturnType<typeof setTimeout> | null = null;

  register(tutorial: Tutorial): void {
    this.tutorials.set(tutorial.id, tutorial);
  }

  start(id: string): void {
    const tutorial = this.tutorials.get(id);
    if (!tutorial || tutorial.steps.length === 0) return;
    this.activeTutorial = tutorial;
    this.currentStepIndex = 0;
    if (tutorial.onStart) {
      const result = tutorial.onStart();
      if (result instanceof Promise) {
        // onStart comes from the tutorial definition, so it is external code.
        result.then(
          () =>
            requestAnimationFrame(() => {
              void this.applyStep();
            }),
          (error: unknown) => {
            logger.error('Tutorial onStart failed:', error);
          },
        );
        return;
      }
    }
    void this.applyStep();
  }

  skip(): void {
    this.cleanup();
    this.activeTutorial = null;
    tutorialOverlayState.set(null, 0, 0);
    this.completionCallback?.();
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

  async goBack(
    restoreFn: (targetIndex: number) => Promise<void>,
  ): Promise<void> {
    if (!this.activeTutorial || this.currentStepIndex <= 0) return;
    this.cleanup();
    const targetIndex = this.currentStepIndex - 1;
    await restoreFn(targetIndex);
    this.currentStepIndex = targetIndex;
    this.suppressAutoAdvance = true;
    await this.applyStep();
  }

  getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  getActiveTutorial(): Tutorial | null {
    return this.activeTutorial;
  }

  onStepApply(cb: StepApplyCallback): void {
    this.stepApplyCallback = cb;
  }

  onComplete(cb: () => void): void {
    this.completionCallback = cb;
  }

  onUIStateTransition(cb: UIStateTransitionCallback): void {
    this.uiStateTransitionCallback = cb;
  }

  onAppStateTransition(cb: AppStateTransitionCallback): void {
    this.appStateTransitionCallback = cb;
  }

  onPostTransition(cb: PostTransitionCallback): void {
    this.postTransitionCallback = cb;
  }

  disarmCurrentListener(): void {
    this.actionCleanup?.();
    this.actionCleanup = null;
    this.actionObserver?.disconnect();
    this.actionObserver = null;
  }

  private async applyStep(): Promise<void> {
    if (!this.activeTutorial) return;
    this.stepApplyCallback?.(this.currentStepIndex);
    const step = this.activeTutorial.steps[this.currentStepIndex];
    if (step.appState && this.appStateTransitionCallback) {
      await this.appStateTransitionCallback(step.appState);
    }
    if (step.uiState) this.uiStateTransitionCallback?.(step.uiState);
    this.postTransitionCallback?.(step.appState);
    this.highlightElement(step.selector, step.scrollArrow ?? false);
    tutorialOverlayState.set(
      step,
      this.currentStepIndex,
      this.activeTutorial.steps.length,
    );
    if (step.waitFor !== 'manual') this.listenForAction(step);
  }

  private highlightElement(selector: string, scrollArrow: boolean): void {
    this.currentSelector = selector;
    this.removeHighlight();
    this.highlightObserver?.disconnect();
    this.highlightObserver = null;
    this.stopReveal();

    const el = document.querySelector(selector);
    if (el) {
      this.revealInView(el);
      this.attachSvgOverlay(el, scrollArrow);
      return;
    }

    // Target isn't in the DOM yet - observe for it to mount while actively
    // revealing it (rows past the rendered window, off-screen rows).
    this.highlightObserver = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (!found) return;
      this.highlightObserver!.disconnect();
      this.highlightObserver = null;
      this.stopReveal();
      if (this.highlightTimeout !== null) {
        clearTimeout(this.highlightTimeout);
        this.highlightTimeout = null;
      }
      this.revealInView(found);
      this.attachSvgOverlay(found, scrollArrow);
    });
    this.highlightObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    this.startReveal(selector);
    this.highlightTimeout = setTimeout(() => {
      this.highlightObserver?.disconnect();
      this.highlightObserver = null;
      this.stopReveal();
      this.highlightTimeout = null;
      logger.warn(`[Tutorial] Element not found after 10s: ${selector}`);
    }, 10_000);
  }

  // Scroll a found target into view if it's outside the viewport, so the
  // highlight (and the user) land on it. The SVG overlay is a child of the
  // target's container, so it follows this scroll automatically.
  private revealInView(el: Element): void {
    const r = el.getBoundingClientRect();
    const outOfView =
      r.bottom <= 0 ||
      r.top >= window.innerHeight ||
      r.right <= 0 ||
      r.left >= window.innerWidth ||
      r.top < 0 ||
      r.bottom > window.innerHeight;
    if (outOfView) el.scrollIntoView({ block: 'center', inline: 'center' });
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

    const htmlEl = el as HTMLElement;
    const pad = 5;

    const voidEl = ['INPUT', 'IMG', 'TEXTAREA', 'HR', 'BR'].includes(
      htmlEl.tagName,
    );
    const container: HTMLElement = voidEl ? htmlEl.parentElement! : htmlEl;

    this.originalPosition = container.style.position;
    if (getComputedStyle(container).position === 'static')
      container.style.position = 'relative';
    this.svgContainer = container;

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
    container.appendChild(svg);
    this.svgOverlay = svg;

    const updateSize = () => {
      const w = htmlEl.offsetWidth + pad * 2;
      const h = htmlEl.offsetHeight + pad * 2;
      if (w <= pad * 2 || h <= pad * 2) return;
      const cs = getComputedStyle(htmlEl);
      const borderTop = parseFloat(cs.borderTopWidth) || 0;
      const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
      let top: number, left: number;
      if (voidEl) {
        const er = htmlEl.getBoundingClientRect();
        const cr = container.getBoundingClientRect();
        top = er.top - cr.top + container.scrollTop - pad - borderTop;
        left = er.left - cr.left + container.scrollLeft - pad - borderLeft;
      } else {
        top = -(pad + borderTop);
        left = -(pad + borderLeft);
      }
      svg.style.top = `${top}px`;
      svg.style.left = `${left}px`;
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

  private listenForAction(step: TutorialStep): void {
    if (step.waitFor === 'appear') {
      const selector = step.waitForSelector ?? step.selector;
      if (document.querySelector(selector)) {
        if (this.suppressAutoAdvance) {
          this.suppressAutoAdvance = false;
          return;
        }
        this.nextStep();
        return;
      }
      this.suppressAutoAdvance = false;
      this.actionObserver = new MutationObserver(() => {
        if (!document.querySelector(selector)) return;
        this.actionObserver!.disconnect();
        this.actionObserver = null;
        if (this.actionTimeout !== null) {
          clearTimeout(this.actionTimeout);
          this.actionTimeout = null;
        }
        this.nextStep();
      });
      this.actionObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
      this.actionTimeout = setTimeout(() => {
        this.actionObserver?.disconnect();
        this.actionObserver = null;
        this.actionTimeout = null;
        logger.warn(
          `[Tutorial] Waited element not found after 10s: ${selector}`,
        );
      }, 10_000);
      return;
    }

    const selector = step.waitForSelector ?? step.selector;
    const eventType = step.waitFor === 'input' ? 'input' : 'click';
    const stopProp = step.stopPropagation ?? false;
    const handler = (e: Event) => {
      if ((e.target as Element).closest?.(selector)) {
        if (stopProp) e.stopPropagation();
        this.nextStep();
      }
    };
    document.body.addEventListener(eventType, handler, { capture: true });
    this.actionCleanup = () =>
      document.body.removeEventListener(eventType, handler, { capture: true });
  }

  private cleanup(): void {
    this.currentSelector = null;
    this.removeHighlight();
    this.stopReveal();
    this.highlightObserver?.disconnect();
    this.highlightObserver = null;
    if (this.highlightTimeout !== null) {
      clearTimeout(this.highlightTimeout);
      this.highlightTimeout = null;
    }
    this.actionObserver?.disconnect();
    this.actionObserver = null;
    if (this.actionTimeout !== null) {
      clearTimeout(this.actionTimeout);
      this.actionTimeout = null;
    }
    this.actionCleanup?.();
    this.actionCleanup = null;
  }
}
