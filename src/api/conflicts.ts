/**
 * Time conflicts between catalog sections, by CRN, decided by the app's own
 * ConflictFilter so semester sections clash with the quarters they span.
 */
import type { WeeklyTimeSlot } from '../types/schedule';
import { ConflictFilter } from '../core/filtering/filters/ConflictFilter';
import { sectionToWeeklySlots } from '../utils/timeSlotUtils';
import type { Catalog, CrnEntry } from './catalog';
import { courseCode } from './serialize';

/** Thrown for input that parses but names things the catalog lacks. */
export class UnknownCrnError extends Error {
  constructor(readonly crns: number[]) {
    super(`Unknown CRN${crns.length === 1 ? '' : 's'}: ${crns.join(', ')}`);
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

export interface ConflictPair {
  a: ConflictSide;
  b: ConflictSide;
}

function side(crn: number, entry: CrnEntry): ConflictSide {
  return {
    crn,
    section: entry.section.number,
    term: entry.section.computedTerm,
    courses: entry.courses.map(courseCode),
  };
}

/** Every pair of the given sections that meets at the same time. */
export function findConflicts(
  catalog: Catalog,
  crns: number[],
): ConflictPair[] {
  const entries = [...lookup(catalog, crns)];
  const filter = new ConflictFilter();
  const pairs: ConflictPair[] = [];

  for (let i = 0; i < entries.length; i++) {
    const [crnA, a] = entries[i];
    for (let j = i + 1; j < entries.length; j++) {
      const [crnB, b] = entries[j];
      const kept = filter.apply([a.filterable], {
        avoidConflicts: true,
        blockedSlots: sectionToWeeklySlots(b.section),
      });
      if (kept.length === 0) pairs.push({ a: side(crnA, a), b: side(crnB, b) });
    }
  }
  return pairs;
}
