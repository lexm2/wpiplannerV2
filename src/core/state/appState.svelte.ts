import type { Schedule, SelectedCourse, SchedulePreferences, Department } from '../../types';

/**
 * Reactive application state (Svelte 5 runes) — the single source of truth that
 * {@link ProfileStateManager} reads and writes.
 *
 * Big collections use `$state.raw`: the manager replaces them wholesale with
 * immutable updates (never mutates in place), and `.raw` keeps the stored
 * objects PLAIN — so they remain structured-cloneable for the storage worker /
 * IndexedDB and preserve `===` identity with catalog Course/Section objects
 * (a deep `$state` proxy would break both).
 *
 * Consumers that need to react read these fields (directly in a component, or
 * via `watch`/`subscribe` from src/svelte/reactivity.svelte in vanilla code).
 */
class AppState {
    activeScheduleId = $state<string | null>(null);
    schedules = $state.raw<Schedule[]>([]);
    selectedCourses = $state.raw<SelectedCourse[]>([]);
    preferences = $state.raw<SchedulePreferences>({ theme: 'wpi-dark', bookmarkedCourseIds: [] });
    isLoading = $state(false);
    lastSaved = $state(0);
    hasUnsavedChanges = $state(false);

    /**
     * Bumped whenever the active schedule is (re)activated or its metadata
     * changes — i.e. the old `active_schedule_changed` trigger. Vanilla
     * consumers `watch` this to refresh. `activationSource` carries the
     * originating source (e.g. 'calendar-event-exclusion') so consumers can
     * preserve source-specific behavior.
     */
    activationGeneration = $state(0);
    activationSource = $state('user');

    /** Bumped after a successful data import (the old 'imported' trigger). */
    importGeneration = $state(0);

    /**
     * Bumped whenever the undo/redo history changes (snapshot captured, undo,
     * redo, or clear) — the old `UndoRedoManager.onChange` trigger. Consumers
     * `watch` this and re-read `canUndo()`/`canRedo()` to refresh button state.
     */
    undoRedoGeneration = $state(0);

    /**
     * Course catalog payload + load signals (the old CourseDataService event
     * system). `loadedDepartments` holds the latest departments; consumers
     * `watch` `dataLoadGeneration` (initial fetch) / `dataRefreshGeneration`
     * (post-sync refresh) and read `loadedDepartments`. Separate generations
     * because load vs refresh have distinct consumer logic.
     */
    loadedDepartments = $state.raw<Department[]>([]);
    dataLoadGeneration = $state(0);
    dataRefreshGeneration = $state(0);

    /** The active schedule object (new identity whenever it or its id changes). */
    activeSchedule = $derived(
        this.schedules.find(s => s.id === this.activeScheduleId) ?? null
    );

    /** Fast `courseId -> SelectedCourse` lookup over the active selection. */
    selectedById = $derived(
        new Map(this.selectedCourses.map(sc => [sc.course.id, sc]))
    );

    /** Bookmarked course ids as a Set, derived from preferences. */
    bookmarkedIds = $derived(
        new Set(this.preferences.bookmarkedCourseIds ?? [])
    );
}

/** App-wide singleton. ProfileStateManager mutates this; everything reads it. */
export const appState = new AppState();
