import type { ComponentKind } from './types';

export type PageId = 'planner' | 'schedule' | 'degree';
export type ViewMode = 'list' | 'grid';

export interface WizardState {
    isOpen: boolean;
    courseId: string | null;
    step: ComponentKind | null;
}

export interface UIState {
    currentPage: PageId;
    currentView: ViewMode;
    openModals: string[];
    wizard: WizardState;
    schedulePickerTab?: 'schedules' | 'settings';
}
