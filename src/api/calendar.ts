/**
 * Dates as the course API reports them: today, the term in session, which
 * terms have ended, and how complete each academic year's schedule is. All
 * of it reads the catalog's clock, so tests can pin "today".
 */
import type { Course } from '../types/types';
import { formatLocalDate } from '../utils/localDate';
import { QUARTERS } from '../utils/typeGuards';
import { currentAcademicYear, type Catalog } from './catalog';

type Quarter = 'A' | 'B' | 'C' | 'D';
export type TermLetter = Quarter | 'F' | 'S';

export interface DateSpan {
  /** YYYY-MM-DD, inclusive. */
  start: string;
  end: string;
}

/**
 * A future year counts as published once it lists at least this share of
 * the current year's courses. WPI's full schedule runs to well over a
 * thousand courses; a year with a handful holds only early entries.
 */
const PUBLISHED_SHARE = 0.25;

type YearStatus = 'past' | 'current' | 'published' | 'not yet published';

export interface YearInfo {
  year: number;
  courseCount: number;
  status: YearStatus;
}

/**
 * Whole days since the seat counts were read from WPI, on the catalog's
 * clock; null when the refresh time is unknown. A deployed server refreshes
 * every 15 minutes, so a large age means the data is a stale copy.
 */
export function seatDataAge(catalog: Catalog): number | null {
  const then = catalog.lastUpdated ? Date.parse(catalog.lastUpdated) : NaN;
  if (Number.isNaN(then)) return null;
  const days = Math.floor((catalog.now().getTime() - then) / 86_400_000);
  return Math.max(0, days);
}

/** Today's date (YYYY-MM-DD) on the catalog's clock. */
export function today(catalog: Catalog): string {
  return formatLocalDate(catalog.now());
}

/**
 * A year's term dates: the four quarters from the term bounds, and the
 * semesters derived from them (F runs from A's start to B's end, S from C's
 * start to D's end). Null when the bounds lack the year.
 */
export function termDates(
  catalog: Catalog,
  year: number,
): Record<TermLetter, DateSpan> | null {
  const bounds = catalog.termBounds.getAllBounds()?.[String(year)];
  if (!bounds) return null;
  const span = (q: Quarter): DateSpan => ({
    start: bounds[q].startDate,
    end: bounds[q].endDate,
  });
  return {
    A: span('A'),
    B: span('B'),
    C: span('C'),
    D: span('D'),
    F: { start: bounds.A.startDate, end: bounds.B.endDate },
    S: { start: bounds.C.startDate, end: bounds.D.endDate },
  };
}

/**
 * Terms of `year` that ended before today. Every term of a past year has
 * ended; a year without term bounds reports none.
 */
export function endedTerms(catalog: Catalog, year: number): TermLetter[] {
  const dates = termDates(catalog, year);
  if (!dates) return [];
  const now = today(catalog);
  return (Object.keys(dates) as TermLetter[]).filter(t => dates[t].end < now);
}

export interface TermNow {
  /** The quarter in session today, or null between terms. */
  term: Quarter | null;
  /** When `term` is null: the next quarter to start, and its start date. */
  next: { term: Quarter; year: number; start: string } | null;
  /** The quarter that ended most recently, when `term` is null. */
  previous: { term: Quarter; year: number; end: string } | null;
}

/** Which quarter is in session today, or which ended and which comes next. */
export function termNow(catalog: Catalog): TermNow {
  const now = today(catalog);
  const all = Object.entries(catalog.termBounds.getAllBounds() ?? {})
    .flatMap(([year, bounds]) =>
      QUARTERS.map(term => ({
        term,
        year: Number(year),
        start: bounds[term].startDate,
        end: bounds[term].endDate,
      })),
    )
    .sort((a, b) => a.start.localeCompare(b.start));

  const current = all.find(t => t.start <= now && now <= t.end);
  if (current) return { term: current.term, next: null, previous: null };

  const next = all.find(t => t.start > now);
  const previous = all.filter(t => t.end < now).at(-1);
  return {
    term: null,
    next: next ? { term: next.term, year: next.year, start: next.start } : null,
    previous: previous
      ? { term: previous.term, year: previous.year, end: previous.end }
      : null,
  };
}

/** Each year in the catalog or the term bounds, with how much it lists. */
export function yearInfo(catalog: Catalog): YearInfo[] {
  const counts = new Map<number, number>();
  for (const course of catalog.courses) {
    if (course.academicYear === undefined) continue;
    counts.set(course.academicYear, (counts.get(course.academicYear) ?? 0) + 1);
  }
  for (const year of Object.keys(catalog.termBounds.getAllBounds() ?? {})) {
    if (!counts.has(Number(year))) counts.set(Number(year), 0);
  }

  const current = currentAcademicYear(catalog);
  const threshold = (counts.get(current) ?? 0) * PUBLISHED_SHARE;
  return [...counts]
    .sort(([a], [b]) => a - b)
    .map(([year, courseCount]) => ({
      year,
      courseCount,
      status:
        year < current
          ? 'past'
          : year === current
            ? 'current'
            : courseCount > 0 && courseCount >= threshold
              ? 'published'
              : 'not yet published',
    }));
}

export function yearStatus(catalog: Catalog, year: number): YearInfo {
  return (
    yearInfo(catalog).find(y => y.year === year) ?? {
      year,
      courseCount: 0,
      status:
        year < currentAcademicYear(catalog) ? 'past' : 'not yet published',
    }
  );
}

/** A year WPI has not published yet: the catalog has at most early entries. */
export const isUnpublished = (catalog: Catalog, year: number) =>
  yearStatus(catalog, year).status === 'not yet published';

/** One of an unpublished year's few early entries. */
export const isEarlyEntry = (catalog: Catalog, course: Course) =>
  course.academicYear !== undefined &&
  course.academicYear > currentAcademicYear(catalog) &&
  isUnpublished(catalog, course.academicYear);

/** "2026-27" for 2026. */
export function yearLabel(year: number): string {
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}
