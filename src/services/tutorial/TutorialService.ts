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
    private svgRect: SVGRectElement | null = null;
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
        this.highlightElement(step.selector);
        this.stepChangeCallback?.(step, this.currentStepIndex, this.activeTutorial.steps.length);
        if (step.waitFor !== 'manual') this.listenForAction(step);
    }

    private highlightElement(selector: string): void {
        this.removeHighlight();
        this.highlightObserver?.disconnect();
        this.highlightObserver = null;

        const el = document.querySelector(selector);
        if (el) {
            this.highlightedElement = el;
            this.attachSvgOverlay(el);
            return;
        }

        this.highlightObserver = new MutationObserver(() => {
            const found = document.querySelector(selector);
            if (!found) return;
            this.highlightObserver!.disconnect();
            this.highlightObserver = null;
            this.highlightedElement = found;
            this.attachSvgOverlay(found);
        });
        this.highlightObserver.observe(document.body, { childList: true, subtree: true });
    }

    private attachSvgOverlay(el: Element): void {
        this.svgOverlay?.remove();
        if (this.positionFrame !== null) cancelAnimationFrame(this.positionFrame);

        const pad = 5;

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
        document.body.appendChild(svg);
        this.svgOverlay = svg;
        this.svgRect = rectEl;

        const sync = () => {
            const r = el.getBoundingClientRect();
            const w = r.width + pad * 2;
            const h = r.height + pad * 2;
            svg.style.top = `${r.top - pad}px`;
            svg.style.left = `${r.left - pad}px`;
            svg.style.width = `${w}px`;
            svg.style.height = `${h}px`;
            rectEl.setAttribute('width', String(w - 2));
            rectEl.setAttribute('height', String(h - 2));
            this.positionFrame = requestAnimationFrame(sync);
        };
        this.positionFrame = requestAnimationFrame(sync);
    }

    private removeHighlight(): void {
        if (this.positionFrame !== null) {
            cancelAnimationFrame(this.positionFrame);
            this.positionFrame = null;
        }
        this.svgOverlay?.remove();
        this.svgOverlay = null;
        this.svgRect = null;
        this.highlightedElement = null;
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
