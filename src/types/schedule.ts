import { Course, Section, SimpleTime, DayOfWeek } from './types'

export interface SelectedCourse {
    course: Course;
    selectedLecture: Section | null;
    selectedDiscussion: Section | null;
    selectedLab: Section | null;
    isRequired: boolean;
    lockedSections: Set<string>;
    customColor?: string;
}


export interface Schedule {
    id: string;
    name: string;
    selectedCourses: SelectedCourse[];
    generatedSchedules: ScheduleCombination[];
    timestamp?: number;
    /** Locally-stored calendar events */
    localEvents?: LocalCalendarEvent[];
}

export interface ScheduleCombination {
    id: string;
    sections: Section[];
    isValid: boolean;
}

export interface SchedulePreferences {
    theme?: string;
    bookmarkedCourseIds?: string[];
}

export interface UserScheduleState {
    activeSchedule: Schedule | null;
    savedSchedules: Schedule[];
    preferences: SchedulePreferences;
}

/**
 * Academic term for blocked time periods.
 * Maps to WPI's 7-week term system.
 */
export enum AcademicTerm {
    A = 'A',
    B = 'B',
    C = 'C',
    D = 'D',
    F = 'F',     // Fall (spans A and B)
    S = 'S',     // Spring (spans C and D)
    ALL = 'ALL'  // Applies to all terms
}

/**
 * ICS-compatible structure for export.
 *
 * Supports two event types:
 * - 'one-time': Single occurrence on a specific date
 * - 'recurring': Weekly recurrence on selected days during selected terms
 */
export interface LocalCalendarEvent {
    /** UUID */
    id: string;
    title: string;
    description?: string;
    eventType: 'one-time' | 'recurring';
    /** For one-time events: specific date (ISO format YYYY-MM-DD) */
    date?: string;
    /** For recurring events: days of week (multiple allowed) */
    days?: DayOfWeek[];
    startTime: SimpleTime;
    endTime: SimpleTime;
    /** For recurring events: which term(s) this applies to */
    terms?: AcademicTerm[];
    visible: boolean;
    createdAt: number;
    updatedAt: number;
}

/**
 * Base type for weekly time slots - core scheduling data only.
 * Used for conflict detection, auto-scheduling, blocked times.
 *
 * This provides a single structure for anything that occupies
 * a day+time on the weekly schedule grid.
 */
export interface WeeklyTimeSlot {
    /** Unique identifier for this slot */
    id: string;
    /** Day of the week */
    day: DayOfWeek;
    /** Start time */
    startTime: SimpleTime;
    /** End time */
    endTime: SimpleTime;
    /** Which academic term this slot belongs to */
    term: AcademicTerm;
}

/**
 * Extended type with display metadata for UI rendering.
 * Used for calendar events, grid display, visual components.
 */
export interface DisplayableTimeSlot extends WeeklyTimeSlot {
    /** Title to display (event name, course code, etc.) */
    title: string;
    /** Subtitle (location, description, etc.) */
    subtitle?: string;
    /** Color for visual styling */
    color?: string;
    /** Where this slot came from */
    sourceType: 'calendar' | 'blocked' | 'course';
    /** Original ID from source (event ID, period ID, etc.) */
    sourceId?: string;
}

/**
 * Hard constraints for auto-schedule generation.
 * These MUST be satisfied - schedules violating these won't be generated.
 */
export interface AutoScheduleConstraints {
    /** Time periods to avoid when scheduling */
    blockedTimes: WeeklyTimeSlot[];
}

/**
 * Soft preferences for auto-schedule ranking.
 * These affect which schedules are shown first, but don't exclude schedules.
 */
export interface AutoSchedulePreferences {
    /** Earliest preferred class time - sections before this are ranked lower */
    wakeUpTime?: SimpleTime | null;
}

/**
 * Combined configuration for auto-schedule generation.
 * Includes both hard constraints and soft preferences.
 */
export interface AutoScheduleConfig extends AutoScheduleConstraints, AutoSchedulePreferences {}

/**
 * UI-level settings for auto-schedule modal.
 * Includes extra flags that get converted to config before generation.
 */
export interface AutoScheduleSettings extends AutoScheduleConfig {
    /** Whether to convert local calendar events to blocked times */
    avoidCalendarEvents?: boolean;
}