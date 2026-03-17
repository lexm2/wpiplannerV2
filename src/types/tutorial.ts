export type TutorialWaitFor = 'click' | 'input' | 'manual' | 'appear';

export interface TutorialStep {
    selector: string;
    title: string;
    description: string;
    waitFor: TutorialWaitFor;
    waitForSelector?: string;
    action?: () => void;
}

export interface Tutorial {
    id: string;
    onStart?: () => void | Promise<void>;
    steps: TutorialStep[];
}
