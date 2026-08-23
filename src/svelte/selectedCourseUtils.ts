import { AcademicTerm } from '../types/schedule';
import type { SelectedCourse } from '../types/schedule';
import type { Course } from '../types/types';

/**
 * Shared helpers for the selected-course lists (SelectedCoursesPanel on the
 * planner page + ScheduleSidebar/SelectedCourseItem on the schedule page), which
 * previously each re-declared the credit formatter, the dept→number comparator,
 * and the term ordering.
 */

export function formatCredits(course: Course): string {
  return course.minCredits === course.maxCredits
    ? `${course.minCredits} credits`
    : `${course.minCredits}-${course.maxCredits} credits`;
}

/** Sort selected courses by department abbreviation, then course number. */
export function compareSelectedCourses(
  a: SelectedCourse,
  b: SelectedCourse,
): number {
  const dept = a.course.departmentAbbr.localeCompare(b.course.departmentAbbr);
  return dept !== 0 ? dept : a.course.number.localeCompare(b.course.number);
}

export const TERM_ORDER: AcademicTerm[] = [
  AcademicTerm.A,
  AcademicTerm.B,
  AcademicTerm.C,
  AcademicTerm.D,
  AcademicTerm.F,
  AcademicTerm.S,
  AcademicTerm.ALL,
];

export const TERM_LABELS: Record<AcademicTerm, string> = {
  [AcademicTerm.A]: 'A Term',
  [AcademicTerm.B]: 'B Term',
  [AcademicTerm.C]: 'C Term',
  [AcademicTerm.D]: 'D Term',
  [AcademicTerm.F]: 'Fall',
  [AcademicTerm.S]: 'Spring',
  [AcademicTerm.ALL]: 'All Terms',
};
