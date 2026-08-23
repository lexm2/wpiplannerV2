/**
 * The single place that maps a degree course (a Workday code string + academic
 * period) onto a catalog {@link Course}. Both directions of the Degree feature
 * use it: planMatcher (plan → schedule) and degreeBuckets / degreePlanService
 * (tiles → catalog entry). Pure (no service/state deps) so it's unit-testable.
 */
import type { AppliedCourse } from '../../types/degree';
import type { Course, Department } from '../../types/types';
import { findCourseById } from '../../types/ScheduleState';

/**
 * Catalog `academicYear` is the fall year of the academic year. A degree course
 * gives a calendar year + season: Fall terms share that year, Spring terms (C/D)
 * belong to the previous fall year.
 */
export function academicYearForPeriod(
  period: AppliedCourse['period'],
): number | null {
  if (!period || !Number.isFinite(period.year)) return null;
  return period.season === 'Spring' ? period.year - 1 : period.year;
}

/**
 * Candidate {dept, number} pairs parsed from a course code, handling cross-listed
 * codes ("CS 2022/ MA 2201") and both spaced ("CS 3013") and unspaced ("CS3013") forms.
 */
export function candidateCodes(
  code: string,
): { dept: string; number: string }[] {
  const out: { dept: string; number: string }[] = [];
  for (const part of code.split('/')) {
    const m = /^\s*([A-Za-z]+)\s*([A-Za-z0-9]+)\s*$/.exec(part);
    if (m) out.push({ dept: m[1].toUpperCase(), number: m[2] });
  }
  return out;
}

export interface FindCatalogCourseOptions {
  /** When the exact year has no match, fall back to the newest matching course (default true). */
  fallbackToNewest?: boolean;
}

/**
 * Resolve a course code to a catalog {@link Course}: prefer `year`, try cross-listed
 * alternates, and (unless disabled) fall back to the newest matching dept+number
 * across all years. Returns null when the catalog has no such course.
 */
export function findCatalogCourse(
  code: string,
  year: number | null,
  departments: Department[],
  opts: FindCatalogCourseOptions = {},
): Course | null {
  const { fallbackToNewest = true } = opts;
  const candidates = candidateCodes(code);

  if (year != null) {
    for (const { dept, number } of candidates) {
      const c = findCourseById(`${dept}-${number}-${year}`, departments);
      if (c) return c;
    }
  }

  if (!fallbackToNewest) return null;

  let best: Course | null = null;
  for (const { dept, number } of candidates) {
    for (const d of departments) {
      if (d.abbreviation.toUpperCase() !== dept) continue;
      for (const c of d.courses) {
        if (
          c.number === number &&
          (!best || (c.academicYear ?? 0) > (best.academicYear ?? 0))
        )
          best = c;
      }
    }
  }
  return best;
}
