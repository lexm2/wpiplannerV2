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
 * A time period that the user wants to block off from scheduling.
 * Used for non-academic commitments like work, clubs, appointments, etc.
 *
 * All fields are strongly typed - no string parsing needed.
 */
export interface BlockedTimePeriod {
    /** Unique identifier for this blocked period */
    id: string;
    /** Day of the week this block applies to */
    day: DayOfWeek;
    /** Start time of the blocked period */
    startTime: SimpleTime;
    /** End time of the blocked period */
    endTime: SimpleTime;
    /** Which academic term(s) this block applies to */
    term: AcademicTerm;
}

/**
 * Configuration for the auto-scheduler.
 * Intentionally minimal - add features incrementally.
 */
export interface AutoScheduleConfig {
    /** Time periods to avoid when scheduling */
    blockedTimes: BlockedTimePeriod[];
}