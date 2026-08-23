/**
 * Every localStorage key the app owns.
 *
 * The string VALUES address data already on real users' machines: changing one
 * resets that user's state. Add keys here, never edit an existing value.
 *
 * (panelWidths.ts keeps its own keys, since they are per-panel config.)
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
  /** Legacy: schedules live in IndexedDB, but clearAllData still purges this. */
  LEGACY_SCHEDULES: 'wpi-planner-schedules',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
