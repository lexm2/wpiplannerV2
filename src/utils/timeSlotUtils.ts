/** Weekly time-slot helpers used by conflict detection. */
import type { WeeklyTimeSlot } from '../types/schedule';
import { AcademicTerm } from '../types/schedule';

const QUARTERS = [
  AcademicTerm.A,
  AcademicTerm.B,
  AcademicTerm.C,
  AcademicTerm.D,
];
// Shared, never mutated: the conflict filter asks per section and slot.
const FALL = [AcademicTerm.A, AcademicTerm.B];
const SPRING = [AcademicTerm.C, AcademicTerm.D];

/**
 * The terms a slot occupies, for overlap tests and mask keys. With `spans`
 * a semester term is its two quarters, so F meets A and B. Without it terms
 * stand alone, and only ALL reaches every other term.
 */
export function termsCovered(term: AcademicTerm, spans = true): AcademicTerm[] {
  if (spans) {
    if (term === AcademicTerm.ALL) return QUARTERS;
    if (term === AcademicTerm.F) return FALL;
    if (term === AcademicTerm.S) return SPRING;
    return [term];
  }
  if (term === AcademicTerm.ALL)
    return [...QUARTERS, AcademicTerm.F, AcademicTerm.S];
  return [term];
}

/**
 * Whether two date ranges share a day. Most sections run their whole term,
 * but some run half of it (BB 3813 BX01 to Nov 12, BX02 from Nov 16) or half
 * a semester, and those never meet. Unknown dates are taken to meet.
 */
function datesMeet(
  aStart: string | undefined,
  aEnd: string | undefined,
  bStart: string | undefined,
  bEnd: string | undefined,
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return true;
  return aStart <= bEnd && bStart <= aEnd;
}

/** What a section or slot occupies besides its weekly hours: term and dates. */
export interface TermScope {
  term: AcademicTerm;
  startDate?: string;
  endDate?: string;
}

/**
 * Whether two things can clash at all, before any weekly hours are compared:
 * their terms share a quarter (F meets A and B, S meets C and D) and their
 * date ranges share a day. The one rule behind the course-list conflict
 * filter and the schedule grid's conflict matrix.
 */
export function scopesOverlap(
  a: TermScope,
  b: TermScope,
  spans = true,
): boolean {
  const aTerms = termsCovered(a.term, spans);
  return (
    termsCovered(b.term, spans).some(t => aTerms.includes(t)) &&
    datesMeet(a.startDate, a.endDate, b.startDate, b.endDate)
  );
}

/**
 * Whether two slots overlap on the same day. Terms are not compared: whether
 * two terms can clash depends on the caller (see termsCovered's `spans`).
 */
export function slotsOverlap(
  slot1: WeeklyTimeSlot,
  slot2: WeeklyTimeSlot,
): boolean {
  if (slot1.day !== slot2.day) return false;

  const start1 = slot1.startTime.hours * 60 + slot1.startTime.minutes;
  const end1 = slot1.endTime.hours * 60 + slot1.endTime.minutes;
  const start2 = slot2.startTime.hours * 60 + slot2.startTime.minutes;
  const end2 = slot2.endTime.hours * 60 + slot2.endTime.minutes;

  return start1 < end2 && start2 < end1;
}

export function periodToWeeklySlots(
  period: import('../types/types').Period,
  term: AcademicTerm,
  sourceId?: string,
): WeeklyTimeSlot[] {
  const slots: WeeklyTimeSlot[] = [];

  for (const day of period.days) {
    slots.push({
      id: `${sourceId || 'period'}-${term}-${day}`,
      day,
      startTime: {
        hours: period.startTime.hours,
        minutes: period.startTime.minutes,
      },
      endTime: {
        hours: period.endTime.hours,
        minutes: period.endTime.minutes,
      },
      term,
    });
  }

  return slots;
}

export function sectionToWeeklySlots(
  section: import('../types/types').Section,
): WeeklyTimeSlot[] {
  const slots: WeeklyTimeSlot[] = [];
  const term = section.computedTerm || AcademicTerm.ALL;

  for (const period of section.periods) {
    slots.push(...periodToWeeklySlots(period, term, String(section.crn)));
  }
  if (section.startDate && section.endDate) {
    for (const slot of slots) {
      slot.startDate = section.startDate;
      slot.endDate = section.endDate;
    }
  }

  return slots;
}
