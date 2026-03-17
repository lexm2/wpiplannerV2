import type { Tutorial, TutorialStep } from '../../types/tutorial';

type StepChangeCallback = (step: TutorialStep | null, index: number, total: number) => void;

export class TutorialService {
    private tutorials: Map<string, Tutorial> = new Map();
    private activeTutorial: Tutorial | null = null;
    private currentStepIndex = 0;
    private stepChangeCallback: StepChangeCallback | null = null;
    private completionCallback: (() => void) | null = null;
    private highlightedElement: Element | null = null;
    private actionCleanup: (() => void) | null = null;
    private highlightObserver: MutationObserver | null = null;
    private actionObserver: MutationObserver | null = null;

    register(tutorial: Tutorial): void { this.tutorials.set(tutorial.id, tutorial); }

    start(id: string): void {
        const tutorial = this.tutorials.get(id);
        if (!tutorial || tutorial.steps.length === 0) return;
        this.activeTutorial = tutorial;
        this.currentStepIndex = 0;
        this.applyStep();
    }

    skip(): void {
        this.cleanup();
        this.activeTutorial = null;
        this.stepChangeCallback?.(null, 0, 0);
        this.completionCallback?.();
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
            el.classList.add('tutorial-highlight');
            this.highlightedElement = el;
            return;
        }

        this.highlightObserver = new MutationObserver(() => {
            const found = document.querySelector(selector);
            if (!found) return;
            this.highlightObserver!.disconnect();
            this.highlightObserver = null;
            found.classList.add('tutorial-highlight');
            this.highlightedElement = found;
        });
        this.highlightObserver.observe(document.body, { childList: true, subtree: true });
    }

    private removeHighlight(): void {
        this.highlightedElement?.classList.remove('tutorial-highlight');
        this.highlightedElement = null;
    }

    private listenForAction(step: TutorialStep): void {
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
