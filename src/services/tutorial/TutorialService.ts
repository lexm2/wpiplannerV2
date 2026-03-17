import type { Tutorial, TutorialStep } from '../../types/tutorial';

type StepChangeCallback = (step: TutorialStep | null, index: number, total: number) => void;

export class TutorialService {
    private tutorials: Map<string, Tutorial> = new Map();
    private activeTutorial: Tutorial | null = null;
    private currentStepIndex = 0;
    private stepChangeCallback: StepChangeCallback | null = null;
    private completionCallback: (() => void) | null = null;
    private highlightedElement: Element | null = null;
    private svgOverlay: SVGSVGElement | null = null;
    private arrowOverlay: HTMLElement | null = null;
    private intersectionObserver: IntersectionObserver | null = null;
    private positionFrame: number | null = null;
    private actionCleanup: (() => void) | null = null;
    private highlightObserver: MutationObserver | null = null;
    private actionObserver: MutationObserver | null = null;

    register(tutorial: Tutorial): void { this.tutorials.set(tutorial.id, tutorial); }

    start(id: string): void {
        const tutorial = this.tutorials.get(id);
        if (!tutorial || tutorial.steps.length === 0) return;
        this.activeTutorial = tutorial;
        this.currentStepIndex = 0;
        if (tutorial.onStart) {
            const result = tutorial.onStart();
            if (result instanceof Promise) {
                result.then(() => this.applyStep());
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

    onStepChange(cb: StepChangeCallback): void { this.stepChangeCallback = cb; }

    onComplete(cb: () => void): void { this.completionCallback = cb; }

    disarmCurrentListener(): void {
        this.actionCleanup?.();
        this.actionCleanup = null;
        this.actionObserver?.disconnect();
        this.actionObserver = null;
    }

    private applyStep(): void {
        if (!this.activeTutorial) return;
        const step = this.activeTutorial.steps[this.currentStepIndex];
        this.highlightElement(step.selector, step.scrollArrow ?? false);
        this.stepChangeCallback?.(step, this.currentStepIndex, this.activeTutorial.steps.length);
        if (step.waitFor !== 'manual') this.listenForAction(step);
    }

    private highlightElement(selector: string, scrollArrow: boolean): void {
        this.removeHighlight();
        this.highlightObserver?.disconnect();
        this.highlightObserver = null;

        const el = document.querySelector(selector);
        if (el) {
            this.highlightedElement = el;
            this.attachSvgOverlay(el, scrollArrow);
            return;
        }

        this.highlightObserver = new MutationObserver(() => {
            const found = document.querySelector(selector);
            if (!found) return;
            this.highlightObserver!.disconnect();
            this.highlightObserver = null;
            this.highlightedElement = found;
            this.attachSvgOverlay(found, scrollArrow);
        });
        this.highlightObserver.observe(document.body, { childList: true, subtree: true });
    }

    private attachSvgOverlay(el: Element, scrollArrow: boolean): void {
        this.svgOverlay?.remove();
        this.arrowOverlay?.remove();
        this.intersectionObserver?.disconnect();
        if (this.positionFrame !== null) { cancelAnimationFrame(this.positionFrame); this.positionFrame = null; }

        const htmlEl = el as HTMLElement;
        if (getComputedStyle(el).position === 'static') htmlEl.style.position = 'relative';

        const w = htmlEl.offsetWidth + 10;
        const h = htmlEl.offsetHeight + 10;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('tutorial-highlight-svg');
        svg.setAttribute('width', String(w));
        svg.setAttribute('height', String(h));

        const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rectEl.setAttribute('x', '1');
        rectEl.setAttribute('y', '1');
        rectEl.setAttribute('width', String(w - 2));
        rectEl.setAttribute('height', String(h - 2));
        rectEl.setAttribute('rx', '6');
        rectEl.setAttribute('fill', 'none');
        rectEl.setAttribute('stroke-width', '2');
        rectEl.setAttribute('stroke-dasharray', '8 6');

        svg.appendChild(rectEl);
        el.appendChild(svg);
        this.svgOverlay = svg;

        if (scrollArrow) {
            const arrow = document.createElement('div');
            arrow.classList.add('tutorial-scroll-arrow');
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
                    const elCX = r.left + r.width / 2;
                    if (elCY < cr.top)         arrow.dataset.direction = 'up';
                    else if (elCY > cr.bottom) arrow.dataset.direction = 'down';
                    else if (elCX < cr.left)   arrow.dataset.direction = 'left';
                    else                       arrow.dataset.direction = 'right';
                }
            }, { threshold: 0 });
            this.intersectionObserver.observe(el);
        }
    }

    private removeHighlight(): void {
        this.svgOverlay?.remove();
        this.svgOverlay = null;
        this.arrowOverlay?.remove();
        this.arrowOverlay = null;
        this.intersectionObserver?.disconnect();
        this.intersectionObserver = null;
        if (this.positionFrame !== null) { cancelAnimationFrame(this.positionFrame); this.positionFrame = null; }
        if (this.highlightedElement) {
            (this.highlightedElement as HTMLElement).style.position = '';
        }
        this.highlightedElement = null;
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
                this.nextStep();
                return;
            }
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
        const handler = () => this.nextStep();

        const target = document.querySelector(selector);
        if (target) {
            target.addEventListener(eventType, handler, { once: true });
            this.actionCleanup = () => target.removeEventListener(eventType, handler);
            return;
        }

        this.actionObserver = new MutationObserver(() => {
            const found = document.querySelector(selector);
            if (!found) return;
            this.actionObserver!.disconnect();
            this.actionObserver = null;
            found.addEventListener(eventType, handler, { once: true });
            this.actionCleanup = () => found.removeEventListener(eventType, handler);
        });
        this.actionObserver.observe(document.body, { childList: true, subtree: true });
    }

    private cleanup(): void {
        this.removeHighlight();
        this.highlightObserver?.disconnect();
        this.highlightObserver = null;
        this.actionObserver?.disconnect();
        this.actionObserver = null;
        this.actionCleanup?.();
        this.actionCleanup = null;
    }
}
