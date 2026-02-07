import type { WeeklyTimeSlot, DisplayableTimeSlot } from '../types/schedule';
import { AcademicTerm, EventType } from '../types/schedule';
import type { SimpleTime, DayOfWeek } from '../types/types';
import type { TimeSlot } from '../types/ui';

/**
 * Generate a unique ID for a time slot.
 */
function generateSlotId(day: DayOfWeek, startTime: SimpleTime, term: AcademicTerm): string {
    return `slot-${day}-${startTime.hours}${startTime.minutes}-${term}`;
}

/**
 * Expand a multi-day TimeSlot (from UI filters) to individual WeeklyTimeSlots.
 * Creates one WeeklyTimeSlot per day in the TimeSlot.days array.
 */
export function expandToWeeklySlots(
    slot: TimeSlot,
    term: AcademicTerm = AcademicTerm.ALL
): WeeklyTimeSlot[] {
    return slot.days.map((day) => ({
        id: generateSlotId(day as DayOfWeek, slot.startTime, term),
        day: day as DayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        term,
    }));
}

/**
 * Create a DisplayableTimeSlot from a base WeeklyTimeSlot by adding display metadata.
 */
export function toDisplayableSlot(
    slot: WeeklyTimeSlot,
    display: {
        title: string;
        sourceType: 'calendar' | 'blocked' | 'course';
        subtitle?: string;
        color?: string;
        sourceId?: string;
    }
): DisplayableTimeSlot {
    return {
        ...slot,
        title: display.title,
        sourceType: display.sourceType,
        subtitle: display.subtitle,
        color: display.color,
        sourceId: display.sourceId,
    };
}

/**
 * Create a WeeklyTimeSlot from individual parameters.
 */
export function createWeeklyTimeSlot(params: {
    day: DayOfWeek;
    startTime: SimpleTime;
    endTime: SimpleTime;
    term: AcademicTerm;
    id?: string;
}): WeeklyTimeSlot {
    return {
        id: params.id || generateSlotId(params.day, params.startTime, params.term),
        day: params.day,
        startTime: params.startTime,
        endTime: params.endTime,
        term: params.term,
    };
}

/**
 * Create a DisplayableTimeSlot from individual parameters.
 */
export function createDisplayableTimeSlot(params: {
    day: DayOfWeek;
    startTime: SimpleTime;
    endTime: SimpleTime;
    term: AcademicTerm;
    title: string;
    sourceType: 'calendar' | 'blocked' | 'course';
    id?: string;
    subtitle?: string;
    color?: string;
    sourceId?: string;
}): DisplayableTimeSlot {
    return {
        id: params.id || generateSlotId(params.day, params.startTime, params.term),
        day: params.day,
        startTime: params.startTime,
        endTime: params.endTime,
        term: params.term,
        title: params.title,
        sourceType: params.sourceType,
        subtitle: params.subtitle,
        color: params.color,
        sourceId: params.sourceId,
    };
}

/**
 * Check if two time slots overlap on the same day.
 */
export function slotsOverlap(slot1: WeeklyTimeSlot, slot2: WeeklyTimeSlot): boolean {
    // Must be on the same day
    if (slot1.day !== slot2.day) return false;

    // Must be in compatible terms (same term or one is ALL)
    if (slot1.term !== slot2.term && slot1.term !== AcademicTerm.ALL && slot2.term !== AcademicTerm.ALL) {
        return false;
    }

    // Convert to minutes for comparison
    const start1 = slot1.startTime.hours * 60 + slot1.startTime.minutes;
    const end1 = slot1.endTime.hours * 60 + slot1.endTime.minutes;
    const start2 = slot2.startTime.hours * 60 + slot2.startTime.minutes;
    const end2 = slot2.endTime.hours * 60 + slot2.endTime.minutes;

    // Check for overlap: slots overlap if one starts before the other ends
    return start1 < end2 && start2 < end1;
}

/**
 * Convert minutes since midnight to SimpleTime.
 */
export function minutesToSimpleTime(minutes: number): SimpleTime {
    return {
        hours: Math.floor(minutes / 60),
        minutes: minutes % 60,
    };
}

/**
 * Convert SimpleTime to minutes since midnight.
 */
export function simpleTimeToMinutes(time: SimpleTime): number {
    return time.hours * 60 + time.minutes;
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

export function calendarEventToWeeklySlots(event: import('../types/schedule').LocalCalendarEvent): WeeklyTimeSlot[] {
    if (event.eventType === EventType.ONE_TIME) {
        return [];
    }

    const slots: WeeklyTimeSlot[] = [];
    const days = event.days || [];
    const terms = event.terms || [AcademicTerm.ALL];

    for (const term of terms) {
        for (const day of days) {
            slots.push({
                id: `${event.id}-${term}-${day}`,
                day,
                startTime: event.startTime,
                endTime: event.endTime,
                term
            });
        }
    }

    return slots;
}
