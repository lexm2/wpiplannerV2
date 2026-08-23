import type { Schedule, SchedulePreferences } from './schedule';
import type { ActiveFilter } from './filters';
import type { UIState } from './uiState';

export type TutorialWaitFor = 'click' | 'input' | 'manual' | 'appear';

export interface TutorialCourseState {
  courseId: string;
  lecture?: string; // section number (e.g., 'TAL01')
  discussion?: string;
  lab?: string;
}

export interface TutorialFilterState {
  id: string;
  criteria: unknown;
}

export interface TutorialAppState {
  selectedCourses?: TutorialCourseState[];
  filters?: TutorialFilterState[];
  autoScheduleTermPrefs?: Record<string, string[]>;
  refreshFilterUI?: boolean;
  runAutoSchedule?: boolean;
}

export interface TutorialStep {
  selector: string;
  title: string;
  description: string;
  waitFor: TutorialWaitFor;
  waitForSelector?: string;
  scrollArrow?: boolean;
  stopPropagation?: boolean;
  uiState?: Partial<UIState>;
  appState?: TutorialAppState;
}

export interface Tutorial {
  id: string;
  onStart?: () => void | Promise<void>;
  steps: TutorialStep[];
  /** Label for the "Next" button on the final step. Defaults to "Next Tutorial". */
  lastStepLabel?: string;
}

export interface TutorialSnapshot {
  stepIndex: number;
  activeScheduleId: string | null;
  schedules: Schedule[];
  preferences: SchedulePreferences;
  uiState: UIState;
  activeFilters: ActiveFilter[];
}
