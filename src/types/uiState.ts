export type PageId = 'planner' | 'schedule';
export type ViewMode = 'list' | 'grid';
export type WizardStep = 'lecture' | 'discussion' | 'lab';

export interface WizardState {
    isOpen: boolean;
    courseId: string | null;
    step: WizardStep | null;
}

export interface UIState {
    currentPage: PageId;
    currentView: ViewMode;
    openModals: string[];
    wizard: WizardState;
    schedulePickerTab?: 'schedules' | 'settings';
}
