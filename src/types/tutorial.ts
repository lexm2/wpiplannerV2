export type TutorialWaitFor = 'click' | 'input' | 'manual';

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
    steps: TutorialStep[];
}
