/**
 * Weekly time-slot helpers used by conflict detection.
 *
 * Seven further exports (slot construction, DisplayableTimeSlot conversion,
 * minute<->SimpleTime math, calendar-event expansion) were deleted in the audit
 * cleanup: all had zero call sites, and callers build these objects inline.
 */
import type { WeeklyTimeSlot } from '../types/schedule';
import { AcademicTerm } from '../types/schedule';

/** Check if two time slots overlap on the same day. */
export function slotsOverlap(slot1: WeeklyTimeSlot, slot2: WeeklyTimeSlot): boolean {
    if (slot1.day !== slot2.day) return false;

    // Terms must be compatible: same term, or one is ALL
    if (slot1.term !== slot2.term && slot1.term !== AcademicTerm.ALL && slot2.term !== AcademicTerm.ALL) {
        return false;
    }

    const start1 = slot1.startTime.hours * 60 + slot1.startTime.minutes;
    const end1 = slot1.endTime.hours * 60 + slot1.endTime.minutes;
    const start2 = slot2.startTime.hours * 60 + slot2.startTime.minutes;
    const end2 = slot2.endTime.hours * 60 + slot2.endTime.minutes;

    return start1 < end2 && start2 < end1;
}


export function periodToWeeklySlots(
    period: import('../types/types').Period,
    term: AcademicTerm,
    sourceId?: string
): WeeklyTimeSlot[] {
    const slots: WeeklyTimeSlot[] = [];

    for (const day of period.days) {
        slots.push({
            id: `${sourceId || 'period'}-${term}-${day}`,
            day,
            startTime: {
                hours: period.startTime.hours,
                minutes: period.startTime.minutes
            },
            endTime: {
                hours: period.endTime.hours,
                minutes: period.endTime.minutes
            },
            term
        });
    }

    return slots;
}

export function sectionToWeeklySlots(section: import('../types/types').Section): WeeklyTimeSlot[] {
    const slots: WeeklyTimeSlot[] = [];
    const term = section.computedTerm || AcademicTerm.ALL;

    for (const period of section.periods) {
        slots.push(...periodToWeeklySlots(period, term, String(section.crn)));
    }

    return slots;
}
