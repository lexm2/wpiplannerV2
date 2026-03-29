import type { Schedule, SchedulePreferences } from './schedule';
import type { ActiveFilter } from './filters';
import type { UIState } from './uiState';

export type TutorialWaitFor = 'click' | 'input' | 'manual' | 'appear';

export interface TutorialStep {
    selector: string;
    title: string;
    description: string;
    waitFor: TutorialWaitFor;
    waitForSelector?: string;
    action?: () => void;
    scrollArrow?: boolean;
}

export interface Tutorial {
    id: string;
    onStart?: () => void | Promise<void>;
    steps: TutorialStep[];
}

export interface TutorialSnapshot {
    stepIndex: number;
    activeScheduleId: string | null;
    schedules: Schedule[];
    preferences: SchedulePreferences;
    uiState: UIState;
    activeFilters: ActiveFilter[];
}
