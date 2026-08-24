import { SimpleTime } from './types';
import { AcademicTerm, SelectedCourse, WeeklyTimeSlot } from './schedule';

export interface FilterCriteria {
  [filterId: string]: unknown;
}

export interface ActiveFilter<TCriteria = unknown> {
  id: string;
  name: string;
  criteria: TCriteria;
  displayValue: string;
}

// Standard filter criteria types
export interface DepartmentFilterCriteria {
  departments: string[];
}

export interface AvailabilityFilterCriteria {
  availableOnly: boolean;
  minAvailable?: number;
}

export interface CreditRangeFilterCriteria {
  min: number;
  max: number;
}

export interface TermFilterCriteria {
  terms: AcademicTerm[];
}

export interface SearchTextFilterCriteria {
  query: string;
  professorOnly?: boolean;
}

export interface GraduateLevelFilterCriteria {
  level: 'all' | 'undergraduate' | 'graduate';
}

export interface AcademicYearFilterCriteria {
  year: number | 'all';
}

interface ConflictFilterCriteria {
  avoidConflicts: boolean;
  blockedSlots: WeeklyTimeSlot[];
}

export interface ConflictCriteria extends ConflictFilterCriteria {
  selectedCourses?: SelectedCourse[];
}

/**
 * Backend-only filter criteria for restricting the course list to those eligible
 * for a degree-requirement bucket (derived from WPI program tracking sheets).
 * Not surfaced in the FilterPanel UI - applied programmatically from the Degree page.
 */
export interface DegreeBucketFilterCriteria {
  /** UPPERCASE valid department codes. Empty array => no department restriction. */
  allowedDepartments: string[];
  /** Course codes NOT allowed even though their department qualifies ("DEPT NUMBER"). */
  excludedCourses: string[];
  /** Optional bucket label for getDisplayValue (e.g. "Social Science"). */
  label?: string;
}

export interface RMPRatingFilterCriteria {
  minRating?: number; // Minimum average rating (0-5 scale)
  maxRating?: number; // Maximum average rating (0-5 scale)
  minDifficulty?: number; // Minimum difficulty rating (0-5 scale)
  maxDifficulty?: number; // Maximum difficulty rating (0-5 scale)
  minWouldTakeAgain?: number; // Minimum "would take again" percentage (0-100)
  maxWouldTakeAgain?: number; // Maximum "would take again" percentage (0-100)
  includeWithoutData?: boolean; // Include professors without RMP data (default: true)
}

export interface BookmarkFilterCriteria {
  showBookmarkedOnly: boolean;
}

export interface WakeUpTimeFilterCriteria {
  wakeUpTime: SimpleTime;
}
