import {
  Course,
  Section,
  SectionsByKind,
  SimpleTime,
  DayOfWeek,
} from './types';

export interface SelectedCourse {
  course: Course;
  /** Chosen section per component kind; an unfilled kind is an absent key. */
  selected: SectionsByKind;
  isRequired: boolean;
  lockedSections: Set<string>;
  customColor?: string;
  allowedTerms?: string[];
}

export interface Schedule {
  id: string;
  name: string;
  selectedCourses: SelectedCourse[];
  generatedSchedules: ScheduleCombination[];
  timestamp?: number;
  /** Locally-stored calendar events */
  localEvents?: LocalCalendarEvent[];
  /** Academic year this schedule targets (e.g. 2026 for "2026-2027") */
  year?: number;
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

/**
 * Academic term for blocked time periods.
 * Maps to WPI's 7-week term system.
 */
export enum AcademicTerm {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
  F = 'F', // Fall (spans A and B)
  S = 'S', // Spring (spans C and D)
  ALL = 'ALL', // Applies to all terms
}

export enum EventType {
  ONE_TIME = 'one-time',
  RECURRING = 'recurring',
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
  eventType: EventType;
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
  id: string;
  day: DayOfWeek;
  startTime: SimpleTime;
  endTime: SimpleTime;
  term: AcademicTerm;
}
