import * as z from 'zod';
import { DayOfWeek } from './types';
import { AcademicTerm } from './schedule';
import type { SelectedCourse, WeeklyTimeSlot } from './schedule';

export interface ActiveFilter<TCriteria = unknown> {
  id: string;
  name: string;
  criteria: TCriteria;
  displayValue: string;
}

export const DepartmentFilterCriteriaSchema = z.object({
  departments: z.array(z.string()),
});
export type DepartmentFilterCriteria = z.output<
  typeof DepartmentFilterCriteriaSchema
>;

export const AvailabilityFilterCriteriaSchema = z.object({
  availableOnly: z.boolean(),
  minAvailable: z.number().optional(),
  /** Keep sections with at most this many students on the waitlist. */
  maxWaitlisted: z.number().optional(),
});
export type AvailabilityFilterCriteria = z.output<
  typeof AvailabilityFilterCriteriaSchema
>;

export const CreditRangeFilterCriteriaSchema = z
  .object({
    min: z.number().min(0),
    max: z.number(),
  })
  .refine(c => c.max >= c.min, 'max must be at least min');
export type CreditRangeFilterCriteria = z.output<
  typeof CreditRangeFilterCriteriaSchema
>;

export const TermFilterCriteriaSchema = z.object({
  terms: z.array(z.enum(AcademicTerm)),
});
export type TermFilterCriteria = z.output<typeof TermFilterCriteriaSchema>;

export const SearchTextFilterCriteriaSchema = z.object({
  query: z.string(),
  professorOnly: z.boolean().optional(),
});
export type SearchTextFilterCriteria = z.output<
  typeof SearchTextFilterCriteriaSchema
>;

export const DegreeAttributeFilterCriteriaSchema = z.object({
  /** Courses counting toward any of these degree attributes ("Social Sciences"). */
  attributes: z.array(z.string()),
});
export type DegreeAttributeFilterCriteria = z.output<
  typeof DegreeAttributeFilterCriteriaSchema
>;

export const DeliveryModeFilterCriteriaSchema = z.object({
  /** Sections taught in any of these modes: "In-Person", "Online", "Hybrid". */
  modes: z.array(z.string()),
});
export type DeliveryModeFilterCriteria = z.output<
  typeof DeliveryModeFilterCriteriaSchema
>;

/**
 * Courses whose number's first digit (1-4 undergraduate, 5 and up graduate:
 * MA 1022 is 1, DS 502 is 5) lies in [min, max]; either bound may be unset.
 */
export const CourseLevelFilterCriteriaSchema = z.object({
  min: z.number().min(0).max(9).optional(),
  max: z.number().min(0).max(9).optional(),
});
export type CourseLevelFilterCriteria = z.output<
  typeof CourseLevelFilterCriteriaSchema
>;

/**
 * Courses with any of these offering categories: 1 every year, 2 at least
 * every other year, 3 occasionally. includeUnknown also keeps courses with
 * no category on record, most graduate courses among them.
 */
export const OfferingPatternFilterCriteriaSchema = z.object({
  categories: z.array(z.union([z.literal(1), z.literal(2), z.literal(3)])),
  includeUnknown: z.boolean().optional(),
});
export type OfferingPatternFilterCriteria = z.output<
  typeof OfferingPatternFilterCriteriaSchema
>;

/**
 * Interest-list placeholders (no times; joined before the real sections
 * open) are dropped unless includeInterestLists is true.
 */
export const InterestListFilterCriteriaSchema = z.object({
  includeInterestLists: z.boolean(),
});
export type InterestListFilterCriteria = z.output<
  typeof InterestListFilterCriteriaSchema
>;

/** The undergraduate levels the Course Level filter can narrow to. */
export const UNDERGRAD_LEVELS = [1000, 2000, 3000, 4000] as const;

export const GraduateLevelFilterCriteriaSchema = z.object({
  level: z.enum(['all', 'undergraduate', 'graduate']),
  /**
   * Narrows to one undergraduate level (1000-4000). Only applies when `level`
   * is 'undergraduate'; ignored otherwise.
   */
  undergradLevel: z
    .literal(UNDERGRAD_LEVELS)
    .optional()
    .describe(
      'With level "undergraduate": only courses of this level, 1000-4000 (MA 1022 is 1000).',
    ),
});
export type GraduateLevelFilterCriteria = z.output<
  typeof GraduateLevelFilterCriteriaSchema
>;

export const AcademicYearFilterCriteriaSchema = z.object({
  year: z.union([z.number(), z.literal('all')]),
});
export type AcademicYearFilterCriteria = z.output<
  typeof AcademicYearFilterCriteriaSchema
>;

export const ConflictCriteriaSchema = z.object({
  avoidConflicts: z.boolean(),
  blockedSlots: z.array(z.custom<WeeklyTimeSlot>()),
  /**
   * A semester section (F/S) conflicts with the quarters it runs through
   * (F: A and B, S: C and D). Unset means on; false keeps the exact-term
   * comparison, where F only conflicts with F.
   */
  semesterSpansQuarters: z.boolean().optional(),
  /**
   * Also hide sections that clash with the active schedule's calendar events.
   * The events are read live when the filter runs, never copied here, so
   * adding or deleting one takes effect at once.
   */
  avoidCalendarEvents: z.boolean().optional(),
  selectedCourses: z.array(z.custom<SelectedCourse>()).optional(),
});
export type ConflictCriteria = z.output<typeof ConflictCriteriaSchema>;

/**
 * Backend-only filter criteria for restricting the course list to those eligible
 * for a degree-requirement bucket (derived from WPI program tracking sheets).
 * Not surfaced in the FilterPanel UI - applied programmatically from the Degree page.
 */
export const DegreeBucketFilterCriteriaSchema = z.object({
  /** UPPERCASE valid department codes. Empty array => no department restriction. */
  allowedDepartments: z.array(z.string()),
  /** Course codes NOT allowed even though their department qualifies ("DEPT NUMBER"). */
  excludedCourses: z.array(z.string()),
  /** Optional bucket label for getDisplayValue (e.g. "Social Science"). */
  label: z.string().optional(),
  /** The degree bucket this was built for, so it can be rebuilt when the record or schedule changes. */
  bucketId: z.string().optional(),
});
export type DegreeBucketFilterCriteria = z.output<
  typeof DegreeBucketFilterCriteriaSchema
>;

export const RMPRatingFilterCriteriaSchema = z.object({
  minRating: z.number().min(0).max(5).optional(),
  maxRating: z.number().min(0).max(5).optional(),
  minDifficulty: z.number().min(0).max(5).optional(),
  maxDifficulty: z.number().min(0).max(5).optional(),
  minWouldTakeAgain: z.number().min(0).max(100).optional(),
  maxWouldTakeAgain: z.number().min(0).max(100).optional(),
  /** Keep professors with no RMP data. Default true. */
  includeWithoutData: z.boolean().optional(),
  /** Fewest ratings a professor's numbers may rest on. */
  minNumRatings: z.number().min(0).optional(),
});
export type RMPRatingFilterCriteria = z.output<
  typeof RMPRatingFilterCriteriaSchema
>;

export interface BookmarkFilterCriteria {
  showBookmarkedOnly: boolean;
}

const TimeGridModeSchema = z.enum(['only', 'avoid']);
export type TimeGridMode = z.output<typeof TimeGridModeSchema>;

/** One painted band on one weekday. Minutes from midnight; half-open [start, end). */
const TimeWindowSchema = z
  .object({
    day: z.enum(DayOfWeek),
    startMin: z.number(),
    endMin: z.number(),
  })
  .refine(w => w.startMin < w.endMin, 'startMin must be before endMin');
export type TimeWindow = z.output<typeof TimeWindowSchema>;

/**
 * `windows` is canonical: sorted by weekday then start, non-overlapping, and
 * non-adjacent. TimesFilter's containment test depends on touching bands
 * having been merged.
 */
export const TimesFilterCriteriaSchema = z.object({
  mode: TimeGridModeSchema,
  windows: z.array(TimeWindowSchema),
  /**
   * Keep sections with nothing on the grid (async, no meeting days). Unset
   * means no: painting times is a statement about when classes meet.
   */
  includeAsync: z.boolean().optional(),
});
export type TimesFilterCriteria = z.output<typeof TimesFilterCriteriaSchema>;
