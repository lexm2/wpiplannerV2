import { Course, Section, SimpleTime, DayOfWeek } from './types'
import type { ConnectedCalendar } from '../services/calendar/types'

export interface SelectedCourse {
    course: Course;
    selectedLecture: Section | null;
    selectedDiscussion: Section | null;
    selectedLab: Section | null;
    selectedSection: Section | null;
    selectedSectionNumber: string | null;
    isRequired: boolean;
    lockedSections: Set<string>;
}

export interface CourseConflict {
    courseId: string;
    courseName: string;
    local: SelectedCourse;
    cloud: SelectedCourse;
}

export type CourseConflictResolution = 'keep-local' | 'keep-cloud';

export interface CourseDifference {
    courseId: string;
    courseName: string;
    differenceType: 'section-only' | 'course-missing';
    local: SelectedCourse | null;
    cloud: SelectedCourse | null;
    sectionDifferences?: {
        lecture: boolean;
        discussion: boolean;
        lab: boolean;
        section: boolean;
    };
}

export interface ScheduleDiff {
    coursesOnlyInLocal: SelectedCourse[];
    coursesOnlyInCloud: SelectedCourse[];
    coursesWithDifferentSections: CourseDifference[];
}

export interface ScheduleConflict {
    scheduleName: string;
    local: Schedule;
    cloud: Schedule;
    diff?: ScheduleDiff;
}

export type ScheduleConflictResolution = 'keep-local' | 'keep-cloud';

export interface Schedule {
    id: string;
    name: string;
    selectedCourses: SelectedCourse[];
    generatedSchedules: ScheduleCombination[];
    timestamp?: number;
    connectedCalendar?: ConnectedCalendar;
}

export interface ScheduleCombination {
    id: string;
    sections: Section[];
    conflicts: TimeConflict[];
    isValid: boolean;
}

export interface TimeConflict {
    section1: Section;
    section2: Section;
    conflictType: ConflictType;
    description: string;
}

export interface SchedulePreferences {
    preferredTimeRange: {
        startTime: SimpleTime;
        endTime: SimpleTime;
    };
    preferredDays: Set<string>;
    avoidBackToBackClasses: boolean;
    theme?: string;
    bookmarkedCourseIds?: string[];
}

export enum ConflictType {
    TIME_OVERLAP = 'time_overlap'
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
    ALL = 'ALL'  // Applies to all terms
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
 * Configuration for the auto-scheduler.
 * Intentionally minimal - add features incrementally.
 */
export interface AutoScheduleConfig {
    /** Time periods to avoid when scheduling */
    blockedTimes: WeeklyTimeSlot[];
}

/**
 * Settings for the auto-scheduler including user preferences.
 * Extended from AutoScheduleConfig to include weights and other settings.
 */
export interface AutoScheduleSettings extends AutoScheduleConfig {
    /** Whether to avoid calendar events when scheduling */
    avoidCalendarEvents?: boolean;
    // Future: weights for scoring (professorRating, earlyMorning, timeGap, etc.)
}