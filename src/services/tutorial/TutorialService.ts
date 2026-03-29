import type { Tutorial, TutorialStep } from '../../types/tutorial';
import { getInlineSVG } from '../../utils';

type StepChangeCallback = (step: TutorialStep | null, index: number, total: number) => void;
type StepApplyCallback = (index: number) => void;

export class TutorialService {
    private tutorials: Map<string, Tutorial> = new Map();
    private activeTutorial: Tutorial | null = null;
    private currentStepIndex = 0;
    private stepChangeCallback: StepChangeCallback | null = null;
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
    private suppressAutoAdvance = false;

    register(tutorial: Tutorial): void { this.tutorials.set(tutorial.id, tutorial); }

    start(id: string): void {
        const tutorial = this.tutorials.get(id);
        if (!tutorial || tutorial.steps.length === 0) return;
        this.activeTutorial = tutorial;
        this.currentStepIndex = 0;
        if (tutorial.onStart) {
            const result = tutorial.onStart();
            if (result instanceof Promise) {
                result.then(() => requestAnimationFrame(() => this.applyStep()));
                return;
            }
        }
        this.applyStep();
    }

    skip(): void {
        this.cleanup();
        this.activeTutorial = null;
        this.stepChangeCallback?.(null, 0, 0);
        this.completionCallback?.();
    }

    cancel(): void {
        this.cleanup();
        this.activeTutorial = null;
        this.stepChangeCallback?.(null, 0, 0);
    }

    nextStep(): void {
        if (!this.activeTutorial) return;
        this.cleanup();
        this.currentStepIndex++;
        if (this.currentStepIndex >= this.activeTutorial.steps.length) {
            this.activeTutorial = null;
            this.stepChangeCallback?.(null, 0, 0);
            this.completionCallback?.();
        } else {
            this.applyStep();
        }
    }

    async goBack(restoreFn: (targetIndex: number) => Promise<void>): Promise<void> {
        if (!this.activeTutorial || this.currentStepIndex <= 0) return;
        this.cleanup();
        const targetIndex = this.currentStepIndex - 1;
        await restoreFn(targetIndex);
        this.currentStepIndex = targetIndex;
        this.suppressAutoAdvance = true;
        this.applyStep();
    }

    getCurrentStepIndex(): number { return this.currentStepIndex; }

    onStepChange(cb: StepChangeCallback): void { this.stepChangeCallback = cb; }

    onStepApply(cb: StepApplyCallback): void { this.stepApplyCallback = cb; }

    onComplete(cb: () => void): void { this.completionCallback = cb; }

    disarmCurrentListener(): void {
        this.actionCleanup?.();
        this.actionCleanup = null;
        this.actionObserver?.disconnect();
        this.actionObserver = null;
    }

    private applyStep(): void {
        if (!this.activeTutorial) return;
        this.stepApplyCallback?.(this.currentStepIndex);
        const step = this.activeTutorial.steps[this.currentStepIndex];
        this.highlightElement(step.selector, step.scrollArrow ?? false);
        this.stepChangeCallback?.(step, this.currentStepIndex, this.activeTutorial.steps.length);
        if (step.waitFor !== 'manual') this.listenForAction(step);
    }

    private highlightElement(selector: string, scrollArrow: boolean): void {
        this.currentSelector = selector;
        this.removeHighlight();
        this.highlightObserver?.disconnect();
        this.highlightObserver = null;

        const el = document.querySelector(selector);
        if (el) {
            this.attachSvgOverlay(el, scrollArrow);
            return;
        }

        this.highlightObserver = new MutationObserver(() => {
            const found = document.querySelector(selector);
            if (!found) return;
            this.highlightObserver!.disconnect();
            this.highlightObserver = null;
            this.attachSvgOverlay(found, scrollArrow);
        });
        this.highlightObserver.observe(document.body, { childList: true, subtree: true });
    }

    private attachSvgOverlay(el: Element, scrollArrow: boolean): void {
        this.svgOverlay?.remove();
        this.arrowOverlay?.remove();
        this.intersectionObserver?.disconnect();
        this.resizeObserver?.disconnect();
        if (this.positionFrame !== null) { cancelAnimationFrame(this.positionFrame); this.positionFrame = null; }

        const htmlEl = el as HTMLElement;
        const pad = 5;

        // Void elements (input, img, etc.) cannot have children — append SVG to parent instead
        const voidEl = ['INPUT', 'IMG', 'TEXTAREA', 'HR', 'BR'].includes(htmlEl.tagName);
        const container: HTMLElement = voidEl ? htmlEl.parentElement! : htmlEl;

        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        this.svgContainer = container;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('tutorial-highlight-svg');

        const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
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
                top = (er.top - cr.top) + container.scrollTop - pad - borderTop;
                left = (er.left - cr.left) + container.scrollLeft - pad - borderLeft;
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

        if (scrollArrow) {
            const arrow = document.createElement('div');
            arrow.classList.add('tutorial-scroll-arrow');
            arrow.innerHTML = getInlineSVG('CHEVRON_DOWN', 'tutorial-scroll-arrow-icon');
            document.body.appendChild(arrow);
            this.arrowOverlay = arrow;

            this.intersectionObserver = new IntersectionObserver(([entry]) => {
                if (entry.isIntersecting) {
                    svg.style.visibility = '';
                    arrow.removeAttribute('data-direction');
                } else {
                    svg.style.visibility = 'hidden';
                    const r = entry.boundingClientRect;
                    const cr = this.getScrollParent(el).getBoundingClientRect();
                    const elCY = r.top + r.height / 2;
                    arrow.dataset.direction = elCY < cr.top + cr.height / 2 ? 'up' : 'down';
                }
            }, { threshold: 0 });
            this.intersectionObserver.observe(el);
        }

        this.highlightObserver = new MutationObserver(() => {
            if (el.isConnected && this.svgOverlay?.isConnected) return;
            this.highlightObserver!.disconnect();
            this.highlightObserver = null;
            this.removeHighlight();
            if (this.currentSelector) this.highlightElement(this.currentSelector, scrollArrow);
        });
        this.highlightObserver.observe(document.body, { childList: true, subtree: true });
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
        if (this.positionFrame !== null) { cancelAnimationFrame(this.positionFrame); this.positionFrame = null; }
        if (this.svgContainer) {
            this.svgContainer.style.position = '';
            this.svgContainer = null;
        }
    }

    private getScrollParent(el: Element): Element {
        let parent = el.parentElement;
        while (parent && parent !== document.body) {
            const { overflow, overflowY } = getComputedStyle(parent);
            if (/auto|scroll/.test(overflow + overflowY)) return parent;
            parent = parent.parentElement;
        }
        return document.documentElement;
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
                this.nextStep();
            });
            this.actionObserver.observe(document.body, { childList: true, subtree: true });
            return;
        }

        const selector = step.waitForSelector ?? step.selector;
        const eventType = step.waitFor === 'input' ? 'input' : 'click';
        const handler = (e: Event) => {
            if ((e.target as Element).closest?.(selector)) this.nextStep();
        };
        document.body.addEventListener(eventType, handler, { capture: true });
        this.actionCleanup = () => document.body.removeEventListener(eventType, handler, { capture: true });
    }

    private cleanup(): void {
        this.currentSelector = null;
        this.removeHighlight();
        this.highlightObserver?.disconnect();
        this.highlightObserver = null;
        this.actionObserver?.disconnect();
        this.actionObserver = null;
        this.actionCleanup?.();
        this.actionCleanup = null;
    }
}
