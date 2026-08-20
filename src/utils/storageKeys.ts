/**
 * Every localStorage key the app owns, in one place.
 *
 * These keys were previously hand-typed at their use sites, which meant
 * `wpi_visited` existed as two independent literals in different files and
 * `wpi-planner-preferences` was declared separately by ThemeManager and
 * TransactionalStorageManager — a rename in one silently orphaning the other's
 * data. Follows the config-object pattern already used by svelte/panelWidths.ts
 * (which owns its own keys, since they are per-panel).
 *
 * The string VALUES are load-bearing: they address data already on real users'
 * machines. Changing one resets that user's state on their next visit. Add keys
 * here; never edit an existing value.
 */
export const STORAGE_KEYS = {
    /** Serialized SchedulePreferences, including the selected theme. */
    PREFERENCES: 'wpi-planner-preferences',
    /** Serialized UserScheduleState. */
    USER_STATE: 'wpi-planner-user-state',
    /** Id of the currently active schedule. */
    ACTIVE_SCHEDULE_ID: 'wpi-planner-active-schedule-id',
    /** Imported Workday academic-progress record for the Degree page. */
    DEGREE_RECORD: 'wpi-planner-degree-record',
    /** Set on first visit; gates the welcome tutorial auto-start. */
    VISITED: 'wpi_visited',
    /** Expanded/collapsed state of the selected-courses panel. */
    SELECTED_COURSES_EXPANDED: 'selectedCoursesExpanded',
    /**
     * Legacy. Schedules live in IndexedDB now and nothing writes this key, but
     * it stays in the registry so clearAllData still purges data left behind on
     * long-time users' machines.
     */
    LEGACY_SCHEDULES: 'wpi-planner-schedules',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
