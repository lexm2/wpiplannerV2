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
