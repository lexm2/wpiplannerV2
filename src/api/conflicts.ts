/**
 * Time conflicts between catalog sections, by CRN, decided by the app's own
 * ConflictFilter so semester sections clash with the quarters they span.
 */
import type { WeeklyTimeSlot } from '../types/schedule';
import { AcademicTerm } from '../types/schedule';
import { DayOfWeek } from '../types/types';
import { ConflictFilter } from '../core/filtering/filters/ConflictFilter';
import { sectionToWeeklySlots, slotsOverlap } from '../utils/timeSlotUtils';
import type { Catalog, CrnEntry } from './catalog';
import { ApiError } from './errors';
import { courseCode } from './serialize';

/** Thrown for CRNs the catalog lacks. */
class UnknownCrnError extends ApiError {
  constructor(readonly crns: number[]) {
    super(
      `Unknown CRN${crns.length === 1 ? '' : 's'}: ${crns.join(', ')}. Get CRNs from get_course or search_courses.`,
      400,
      { unknownCrns: crns },
    );
  }
}

function lookup(catalog: Catalog, crns: number[]): Map<number, CrnEntry> {
  const found = new Map<number, CrnEntry>();
  const missing: number[] = [];
  for (const crn of new Set(crns)) {
    const entry = catalog.sectionsByCrn.get(crn);
    if (entry) found.set(crn, entry);
    else missing.push(crn);
  }
  if (missing.length > 0) throw new UnknownCrnError(missing);
  return found;
}

/**
 * The weekly slots the given sections occupy, as ConflictFilter's
 * blockedSlots. Each slot id starts with its CRN, which is how the filter
 * keeps a section from conflicting with itself.
 */
export function blockedSlotsForCrns(
  catalog: Catalog,
  crns: number[],
): WeeklyTimeSlot[] {
  return [...lookup(catalog, crns).values()].flatMap(e =>
    sectionToWeeklySlots(e.section),
  );
}

interface ConflictSide {
  crn: number;
  section: string;
  term: string;
  /** Every course listing this CRN; cross-listed courses share sections. */
  courses: string[];
}

/** When both sections meet: these days, from start to end ("HH:MM"). */
interface Overlap {
  days: string[];
  start: string;
  end: string;
}

interface ConflictPair {
  a: ConflictSide;
  b: ConflictSide;
  overlaps: Overlap[];
}

export interface ConflictCheck {
  /** The distinct CRNs compared, in the order given. */
  checked: number[];
  /** CRNs given more than once, compared once. */
  duplicates: number[];
  conflicts: ConflictPair[];
}

function side(crn: number, entry: CrnEntry): ConflictSide {
  return {
    crn,
    section: entry.section.number,
    term: entry.section.computedTerm,
    courses: entry.courses.map(courseCode),
  };
}

const SPANS: Partial<Record<string, string[]>> = {
  [AcademicTerm.F]: [AcademicTerm.A, AcademicTerm.B],
  [AcademicTerm.S]: [AcademicTerm.C, AcademicTerm.D],
};
const quarters = (term: AcademicTerm): string[] => SPANS[term] ?? [term];
const termsMeet = (a: AcademicTerm, b: AcademicTerm) =>
  a === AcademicTerm.ALL ||
  b === AcademicTerm.ALL ||
  quarters(a).some(q => quarters(b).includes(q));

const clock = (t: { hours: number; minutes: number }) =>
  `${String(t.hours).padStart(2, '0')}:${String(t.minutes).padStart(2, '0')}`;
const DAY_ORDER: string[] = Object.values(DayOfWeek);

/** The shared meeting times of two sections, grouped by time band. */
function overlapsOf(a: CrnEntry, b: CrnEntry): Overlap[] {
  if (!termsMeet(a.section.computedTerm, b.section.computedTerm)) return [];
  const bands = new Map<string, Set<string>>();
  for (const sa of sectionToWeeklySlots(a.section)) {
    for (const sb of sectionToWeeklySlots(b.section)) {
      if (!slotsOverlap(sa, sb)) continue;
      const start =
        sa.startTime.hours * 60 + sa.startTime.minutes >
        sb.startTime.hours * 60 + sb.startTime.minutes
          ? sa.startTime
          : sb.startTime;
      const end =
        sa.endTime.hours * 60 + sa.endTime.minutes <
        sb.endTime.hours * 60 + sb.endTime.minutes
          ? sa.endTime
          : sb.endTime;
      const band = `${clock(start)}-${clock(end)}`;
      if (!bands.has(band)) bands.set(band, new Set());
      bands.get(band)!.add(sa.day);
    }
  }
  return [...bands].map(([band, days]) => {
    const [start, end] = band.split('-');
    return {
      days: [...days].sort(
        (x, y) => DAY_ORDER.indexOf(x) - DAY_ORDER.indexOf(y),
      ),
      start,
      end,
    };
  });
}

/** Every pair of the given sections that meets at the same time. */
export function findConflicts(catalog: Catalog, crns: number[]): ConflictCheck {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const crn of crns) {
    if (seen.has(crn)) duplicates.add(crn);
    seen.add(crn);
  }

  const entries = [...lookup(catalog, crns)];
  const filter = new ConflictFilter();
  const conflicts: ConflictPair[] = [];

  for (let i = 0; i < entries.length; i++) {
    const [crnA, a] = entries[i];
    for (let j = i + 1; j < entries.length; j++) {
      const [crnB, b] = entries[j];
      const kept = filter.apply([a.filterable], {
        avoidConflicts: true,
        blockedSlots: sectionToWeeklySlots(b.section),
      });
      if (kept.length === 0) {
        conflicts.push({
          a: side(crnA, a),
          b: side(crnB, b),
          overlaps: overlapsOf(a, b),
        });
      }
    }
  }
  return {
    checked: entries.map(([crn]) => crn),
    duplicates: [...duplicates],
    conflicts,
  };
}
