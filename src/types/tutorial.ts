import type { ComponentKind } from './types';
import type { PageId } from './uiState';
import type { DrawerId } from '../svelte/drawerState.svelte';
import type {
  Importance,
  RankingPreferences,
} from '../services/scheduling/rankingPreferences';

/** Windows a step can have open; side drawers are a separate, view-only thing. */
export type TutorialModal =
  | 'filter-modal'
  | 'schedule-picker'
  | 'auto-schedule-intro'
  | 'auto-schedule-filter';

/** Section numbers (e.g. 'TCL01') picked for a course. */
export interface TutorialPicks {
  lecture?: string;
  discussion?: string;
  lab?: string;
}

/**
 * Everything about the app a tutorial step can depend on. The state at a step
 * is the tutorial's `start` plus the `does` of every step before it.
 */
export interface TutorialState {
  page: PageId;
  wizard: { courseId: string; step: ComponentKind } | null;
  modal: TutorialModal | null;
  /** Exactly these courses are selected, with exactly these picks. */
  courses: Record<string, TutorialPicks>;
  /** Filter id to criteria. */
  filters: Record<string, unknown>;
  /** Importances over the defaults. */
  ranking: Partial<Record<keyof RankingPreferences, Importance>>;
  /** The course shown in the details panel. */
  viewing: string | null;
  /** A generated schedule is showing. */
  generated: boolean;
}

interface BaseStep {
  title: string;
  description: string;
  /** What this step's click leaves behind, carried into every later step. */
  does?: Partial<TutorialState>;
  /** A side panel to slide in while this step shows. Not carried forward. */
  drawer?: DrawerId;
}

/** The student clicks `selector` to move on. */
interface ActionStep extends BaseStep {
  waitFor: 'click';
  /**
   * What the student clicks, which is also what gets the outline. Must resolve
   * at every window width the tutorials run at (see `compact` for what moves).
   */
  selector: string;
  /**
   * What opens the way to `selector` while it isn't on the page, like a menu's
   * button. Gets the outline until then; clicking it doesn't move on.
   */
  via?: string;
  scrollArrow?: boolean;
  /**
   * Replaces fields of this step while the header is collapsed into the gear
   * menu (<=1250px), for a target that is only reachable another way there.
   */
  compact?: Partial<Pick<ActionStep, 'selector' | 'via' | 'description'>>;
}

/** Reading only: Next is what is highlighted. */
interface ReadingStep extends BaseStep {
  waitFor: 'manual';
  /**
   * What the text describes. Gets its own solid outline, is scrolled into view
   * and is kept clear of the box.
   */
  about?: string;
}

export type TutorialStep = ActionStep | ReadingStep;

/** A step as it runs at the current window width. */
export interface ResolvedStep {
  title: string;
  description: string;
  waitFor: 'click' | 'manual';
  selector: string;
  via?: string;
  about?: string;
  scrollArrow?: boolean;
  drawer?: DrawerId;
}

export interface Tutorial {
  id: string;
  /** Where the app is when the tutorial begins; unnamed fields take defaults. */
  start: Partial<TutorialState>;
  steps: TutorialStep[];
  /** Label for the "Next" button on the final step. Defaults to "Next Tutorial". */
  lastStepLabel?: string;
}
