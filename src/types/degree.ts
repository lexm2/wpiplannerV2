/**
 * Data model for a parsed WPI Workday "View My Academic Progress" export.
 *
 * The shape mirrors academic_progress_parser_plan.md. A degree course is a
 * transcript line (grade / term / transfer flags) and is intentionally distinct
 * from the catalog `Course` in types/types.ts - they are different concepts.
 *
 * The model is deliberately plain (no Map/Set) so it round-trips cleanly through
 * JSON for localStorage persistence.
 */

export type RequirementStatus = 'satisfied' | 'in_progress' | 'not_satisfied';

export type RequirementCategory =
  | 'total_credits'
  | 'residency'
  | 'mqp'
  | 'mqp_completion'
  | 'iqp'
  | 'iqp_completion'
  | 'hua'
  | 'hua_completion'
  | 'social_science'
  | 'physical_education'
  | 'major_specific'
  | 'free_electives'
  | 'unused';

export interface AcademicPeriod {
  year: number;
  season: 'Fall' | 'Spring';
  /** 'A'..'E', or null for semester-long activities (e.g. WPE). */
  term: string | null;
  /** Original string, preserved verbatim (e.g. "2025 Fall A Term"). */
  raw: string;
}

export interface AppliedCourse {
  code: string; // "CS 3013"
  department: string; // "CS"
  number: string; // "3013" - string to tolerate codes like "210X"
  title: string;
  credits: number;
  grade: string | null; // "A", "P", "L" (transfer), or null when in progress
  isTransfer: boolean;
  isInProgress: boolean;
  period: AcademicPeriod | null; // null for transfer credit
  /** Names of every requirement this course is applied to. */
  satisfies: string[];
}

export interface Requirement {
  rawName: string;
  category: RequirementCategory;
  scope: string; // "WPI" or the major name
  name: string; // short name
  status: RequirementStatus;
  creditsRequired: number | null;
  creditsRemaining: number | null;
  coursesRemaining: number | null;
  appliedCourses: AppliedCourse[];
}

export interface CreditTotals {
  earned: number;
  inProgress: number;
  transfer: number;
  required: number | null;
}

export interface StudentRecord {
  schemaVersion: 1;
  major: string;
  degree: string; // "BS", "BA", ...
  startYear: number | null;
  importedAt: string; // ISO timestamp
  requirements: Requirement[];
  courses: AppliedCourse[]; // deduped master list
  credits: CreditTotals;
}

export const DEGREE_SCHEMA_VERSION = 1 as const;

/**
 * A bucket the user created by hand. `coursesRemaining` mirrors the field name
 * on Requirement so effectiveProgress() covers both kinds without a shim.
 */
export interface CustomBucket {
  id: string; // `custom:<n>`
  name: string;
  creditsRequired: number | null;
  coursesRemaining: number | null;
  /** Departments whose courses fill this bucket; [] = no restriction. */
  departments: string[];
}

/** User edits layered over an imported (Workday) bucket. */
export interface BucketOverride {
  name?: string;
  creditsRequired?: number | null;
  coursesRemaining?: number | null;
}

/**
 * The user's bucket layout and course placements.
 *
 * Persisted separately from StudentRecord so a re-import replaces the
 * transcript without discarding the buckets you built or the courses you
 * placed; deleting an imported bucket is recorded in `hidden` rather than by
 * mutating the record. `assignments` keys on the catalog course id, which is
 * stable across reloads and independent of which bucket a course sits in.
 */
export interface DegreeBucketConfig {
  schemaVersion: 1;
  custom: CustomBucket[];
  /** Bucket id -> edits. */
  overrides: Record<string, BucketOverride>;
  /** Ids of imported buckets the user deleted. */
  hidden: string[];
  /** Display order of bucket ids; ids absent from it render last. */
  order: string[];
  /** Catalog course id -> bucket id. */
  assignments: Record<string, string>;
}

export const DEGREE_BUCKET_CONFIG_VERSION = 1 as const;

/** Bucket id for a Workday-imported requirement. */
export const importedBucketId = (rawName: string): string => `req:${rawName}`;

export const EMPTY_BUCKET_CONFIG: DegreeBucketConfig = {
  schemaVersion: DEGREE_BUCKET_CONFIG_VERSION,
  custom: [],
  overrides: {},
  hidden: [],
  order: [],
  assignments: {},
};
