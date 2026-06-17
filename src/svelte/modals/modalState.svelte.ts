import type { SectionData } from '../../types/modal';
import type { LocalCalendarEvent, SelectedCourse } from '../../types/schedule';

export interface DeleteLocalEventPayload {
    title: string;
    onConfirm: () => void;
}

export interface LocalEventPayload {
    /** Callback when the event is saved */
    onSave: (event: Omit<LocalCalendarEvent, 'id' | 'createdAt' | 'updatedAt'>) => void;
    /** Optional: existing event to edit (if not provided, creates new) */
    existingEvent?: LocalCalendarEvent;
}

export interface FilterModalPayload {
    /** 'filter' = planner/schedule filter; 'auto-schedule' = generate settings. */
    mode: 'filter' | 'auto-schedule';
    /** auto-schedule only: invoked (after close) when "Generate Schedule" clicked. */
    onGenerate?: () => void;
    /** auto-schedule only: the courses being scheduled (drives the preview). */
    coursesToSchedule?: SelectedCourse[];
}

export interface AutoScheduleIntroPayload {
    selectedCourses: SelectedCourse[];
    getColor: (courseId: string) => string;
    /** Invoked with the term-filtered courses when the user clicks Next */
    onNext: (filtered: SelectedCourse[]) => void;
}

class ModalState {
    sectionInfo = $state.raw<SectionData | null>(null);
    deleteLocalEvent = $state.raw<DeleteLocalEventPayload | null>(null);
    localEvent = $state.raw<LocalEventPayload | null>(null);
    autoScheduleIntro = $state.raw<AutoScheduleIntroPayload | null>(null);
    // Tutorial-driven term-preference overrides (replaces the imperative
    // AutoScheduleIntroModal.setTermPreferences call). The component merges
    // these into its per-course term selection whenever this changes.
    autoScheduleIntroTermPrefs = $state.raw<Record<string, string[]> | null>(null);
    // Tutorial-driven schedule-picker tab navigation (replaces the imperative
    // SchedulePickerModal.navigateToTab call). The component applies it to its
    // local active-tab then nulls this channel.
    schedulePickerTab = $state.raw<'schedules' | 'settings' | null>(null);
    // Filter modal payload (mode + auto-schedule continuation). Set by the
    // trigger site before modalOpened('filter-modal' | 'auto-schedule-filter').
    filter = $state.raw<FilterModalPayload | null>(null);
}

export const modalState = new ModalState();
