import type { Course, Section, SectionsByKind } from './types';

/**
 * Component selections paired with a course.
 * Used for batch operations like auto-schedule apply and bulk section updates.
 */
export interface CourseComponentSelections {
  course: Course;
  selected: SectionsByKind;
}

/**
 * A section candidate with its bitmask for conflict detection.
 * Used in the auto-scheduler's backtracking algorithm.
 */
export interface SectionCandidate {
  section: Section | null;
  mask: bigint;
}
