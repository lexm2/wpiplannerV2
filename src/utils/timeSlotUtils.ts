/** Weekly time-slot helpers used by conflict detection. */
import type { WeeklyTimeSlot } from '../types/schedule';
import { AcademicTerm } from '../types/schedule';

/**
 * Whether two slots overlap on the same day. Terms are not compared: whether
 * two terms can clash depends on the caller (see ConflictFilter's
 * semesterSpansQuarters).
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
