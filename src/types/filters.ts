import { DayOfWeek } from './types';
import { AcademicTerm, SelectedCourse, WeeklyTimeSlot } from './schedule';

export interface ActiveFilter<TCriteria = unknown> {
  id: string;
  name: string;
  criteria: TCriteria;
  displayValue: string;
}

export interface DepartmentFilterCriteria {
  departments: string[];
}

export interface AvailabilityFilterCriteria {
  availableOnly: boolean;
  minAvailable?: number;
  /** Keep sections with at most this many students on the waitlist. */
  maxWaitlisted?: number;
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

/** Courses counting toward any of these degree attributes ("Social Sciences"). */
export interface DegreeAttributeFilterCriteria {
  attributes: string[];
}

/** Sections taught in any of these modes: "In-Person", "Online", "Hybrid". */
export interface DeliveryModeFilterCriteria {
  modes: string[];
}

/**
 * Courses whose number's first digit (1-4 undergraduate, 5 and up graduate:
 * MA 1022 is 1, DS 502 is 5) lies in [min, max]; either bound may be unset.
 */
export interface CourseLevelFilterCriteria {
  min?: number;
  max?: number;
}

/**
 * Courses with any of these offering categories: 1 every year, 2 at least
 * every other year, 3 occasionally. includeUnknown also keeps courses with
 * no category on record, most graduate courses among them.
 */
export interface OfferingPatternFilterCriteria {
  categories: (1 | 2 | 3)[];
  includeUnknown?: boolean;
}

/**
 * Interest-list placeholders (no times; joined before the real sections
 * open) are dropped unless includeInterestLists is true.
 */
export interface InterestListFilterCriteria {
  includeInterestLists: boolean;
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
  /**
   * A semester section (F/S) conflicts with the quarters it runs through
   * (F: A and B, S: C and D). Unset means on; false keeps the exact-term
   * comparison, where F only conflicts with F.
   */
  semesterSpansQuarters?: boolean;
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
  minNumRatings?: number; // Fewest ratings a professor's numbers may rest on
}

export interface BookmarkFilterCriteria {
  showBookmarkedOnly: boolean;
}

export type TimeGridMode = 'only' | 'avoid';

/** One painted band on one weekday. Minutes from midnight; half-open [start, end). */
export interface TimeWindow {
  day: DayOfWeek;
  startMin: number;
  endMin: number;
}

/**
 * `windows` is canonical: sorted by weekday then start, non-overlapping, and
 * non-adjacent. TimesFilter's containment test depends on touching bands
 * having been merged.
 */
export interface TimesFilterCriteria {
  mode: TimeGridMode;
  windows: TimeWindow[];
  /**
   * Keep sections with nothing on the grid (async, no meeting days). Unset
   * means no: painting times is a statement about when classes meet.
   */
  includeAsync?: boolean;
}
