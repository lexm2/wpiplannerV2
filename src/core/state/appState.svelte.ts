import type {
  Schedule,
  SelectedCourse,
  SchedulePreferences,
} from '../../types/schedule';
import type { Department } from '../../types/types';

/**
 * Reactive application state (Svelte 5 runes) - the single source of truth that
 * {@link ProfileStateManager} reads and writes.
 *
 * Big collections use `$state.raw`: the manager replaces them wholesale with
 * immutable updates (never mutates in place), and `.raw` keeps the stored
 * objects PLAIN - so they remain structured-cloneable for the storage worker /
 * IndexedDB and preserve `===` identity with catalog Course/Section objects
 * (a deep `$state` proxy would break both).
 *
 * Consumers that need to react read these fields directly in a component or in
 * an App.svelte `$effect` - runes are the only reactivity mechanism.
 */
class AppState {
  activeScheduleId = $state<string | null>(null);
  schedules = $state.raw<Schedule[]>([]);
  selectedCourses = $state.raw<SelectedCourse[]>([]);
  preferences = $state.raw<SchedulePreferences>({
    theme: 'wpi-dark',
    bookmarkedCourseIds: [],
  });
  isLoading = $state(false);
  lastSaved = $state(0);
  hasUnsavedChanges = $state(false);

  /**
   * The most recent active-schedule (re)activation event.
   * {@link ProfileStateManager} reassigns this (a fresh object) whenever the
   * active schedule is switched, deleted, or has its metadata updated;
   * consumers `watch` it to refresh and read `.source` to branch on origin
   * (e.g. 'calendar-event-exclusion'). A reassigned object - rather than a
   * counter - fires on exactly these events without the spurious fires that
   * watching `activeSchedule` identity would bring (it changes on every course
   * add).
   */
  activation = $state.raw<{ source: string }>({ source: 'user' });

  /**
   * Whether undo/redo are currently available. {@link UndoRedoManager} writes
   * these after every history change (capture, undo, redo, clear); the
   * UndoRedoButtons component reads them directly for its disabled state.
   */
  canUndo = $state(false);
  canRedo = $state(false);

  /**
   * Course catalog. CourseDataService reassigns this (a freshly-built array)
   * on the initial fetch and every post-sync refresh; consumers read it in an
   * `$effect` and distinguish load vs refresh locally (see App.svelte's
   * loadedDepartments effect).
   */
  loadedDepartments = $state.raw<Department[]>([]);

  /**
   * Generated auto-schedule result count + the currently-applied index.
   * {@link AutoScheduleOrchestrator} writes these on every transition
   * (generated, navigated, reset, or invalidated by a selection change); the
   * AutoScheduleControls footer reads them directly for its nav + progress bar.
   */
  autoScheduleCount = $state(0);
  autoScheduleIndex = $state(0);

  /**
   * True while the auto-scheduler is generating. Drives the declarative
   * schedule grid's generating overlay.
   */
  scheduleGenerating = $state(false);

  /** The active schedule object (new identity whenever it or its id changes). */
  activeSchedule = $derived(
    this.schedules.find(s => s.id === this.activeScheduleId) ?? null,
  );

  /** Fast `courseId -> SelectedCourse` lookup over the active selection. */
  selectedById = $derived(
    new Map(this.selectedCourses.map(sc => [sc.course.id, sc])),
  );

  /** Bookmarked course ids as a Set, derived from preferences. */
  bookmarkedIds = $derived(new Set(this.preferences.bookmarkedCourseIds ?? []));
}

/** App-wide singleton. ProfileStateManager mutates this; everything reads it. */
export const appState = new AppState();
