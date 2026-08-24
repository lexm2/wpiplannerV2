import type { SectionData } from '../../types/modal';
import { openModal } from '../../services/ui/uiState.svelte';
import type { LocalCalendarEvent, SelectedCourse } from '../../types/schedule';

/** `input: true` makes it a prompt, and onConfirm receives the entered value. */
export interface ConfirmPayload {
  title: string;
  /** Newline-separated; each line renders as its own paragraph. */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' styles the confirm button red, for destructive actions. */
  variant?: 'default' | 'danger';
  /** Render a text field and pass its value to onConfirm (prompt replacement). */
  input?: boolean;
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (value?: string) => void;
}

interface DeleteLocalEventPayload {
  title: string;
  onConfirm: () => void;
}

interface LocalEventPayload {
  /** Callback when the event is saved */
  onSave: (
    event: Omit<LocalCalendarEvent, 'id' | 'createdAt' | 'updatedAt'>,
  ) => void;
  /** Optional: existing event to edit (if not provided, creates new) */
  existingEvent?: LocalCalendarEvent;
}

interface FilterModalPayload {
  /** 'filter' = planner/schedule filter; 'auto-schedule' = generate settings. */
  mode: 'filter' | 'auto-schedule';
  /** auto-schedule only: invoked (after close) when "Generate Schedule" clicked. */
  onGenerate?: () => void;
  /** auto-schedule only: the courses being scheduled (drives the preview). */
  coursesToSchedule?: SelectedCourse[];
}

interface AutoScheduleIntroPayload {
  selectedCourses: SelectedCourse[];
  getColor: (courseId: string) => string;
  /** Invoked with the term-filtered courses when the user clicks Next */
  onNext: (filtered: SelectedCourse[]) => void;
}

class ModalState {
  sectionInfo = $state.raw<SectionData | null>(null);
  confirm = $state.raw<ConfirmPayload | null>(null);
  deleteLocalEvent = $state.raw<DeleteLocalEventPayload | null>(null);
  localEvent = $state.raw<LocalEventPayload | null>(null);
  autoScheduleIntro = $state.raw<AutoScheduleIntroPayload | null>(null);
  // Tutorial-driven term-preference overrides (replaces the imperative
  // AutoScheduleIntroModal.setTermPreferences call). The component merges
  // these into its per-course term selection whenever this changes.
  autoScheduleIntroTermPrefs = $state.raw<Record<string, string[]> | null>(
    null,
  );
  // Tutorial-driven schedule-picker tab navigation (replaces the imperative
  // SchedulePickerModal.navigateToTab call). The component applies it to its
  // local active-tab then nulls this channel.
  schedulePickerTab = $state.raw<'schedules' | 'settings' | null>(null);
  // Filter modal payload (mode + auto-schedule continuation). Set by the
  // trigger site before modalOpened('filter-modal' | 'auto-schedule-filter').
  filter = $state.raw<FilterModalPayload | null>(null);
}

export const modalState = new ModalState();

/** Themed replacement for native confirm()/prompt(); works from .ts services too. */
export function showConfirm(payload: ConfirmPayload): void {
  modalState.confirm = payload;
  openModal('confirm');
}
