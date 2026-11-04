/**
 * ConflictFilter with `avoidCalendarEvents`: the calendar's slots are read
 * through the injected source each time the filter runs, never copied into
 * the criteria.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  ConflictFilter,
  setCalendarSlotSource,
} from '../../src/core/filtering/filters/ConflictFilter';
import {
  DayOfWeek,
  PeriodType,
  SectionType,
  type Course,
  type Section,
} from '../../src/types/types';
import { AcademicTerm, type WeeklyTimeSlot } from '../../src/types/schedule';
import type { FilterableSection } from '../../src/types/filterableUnit';

function mondaySection(number: string, hour: number): Section {
  return {
    crn: 7000 + hour,
    number,
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 0,
    computedTerm: AcademicTerm.A,
    periods: [
      {
        type: PeriodType.LECTURE,
        professor: 'Prof X',
        startTime: { hours: hour, minutes: 0 },
        endTime: { hours: hour, minutes: 50 },
        location: 'SH',
        building: 'SH',
        room: '101',
        seats: 30,
        seatsAvailable: 10,
        actualWaitlist: 0,
        maxWaitlist: 0,
        days: new Set([DayOfWeek.MONDAY]),
      },
    ],
  } as Section;
}

const course = { id: 'CS1000', departmentAbbr: 'CS', number: '1000' } as Course;

function unit(section: Section): FilterableSection {
  return { course, section, sectionType: SectionType.LECTURE };
}

function eventSlot(startHour: number, endHour: number): WeeklyTimeSlot {
  return {
    id: `local-1-A-${DayOfWeek.MONDAY}`,
    day: DayOfWeek.MONDAY,
    startTime: { hours: startHour, minutes: 0 },
    endTime: { hours: endHour, minutes: 0 },
    term: AcademicTerm.A,
  };
}

const nine = mondaySection('AL01', 9);
const noon = mondaySection('AL02', 12);
const numbers = (sections: FilterableSection[]): string[] =>
  sections.map(fs => fs.section.number);

describe('ConflictFilter avoidCalendarEvents', () => {
  afterEach(() => setCalendarSlotSource(null));

  it('hides sections that clash with the calendar events', () => {
    setCalendarSlotSource(() => [eventSlot(9, 10)]);
    const result = new ConflictFilter().apply([unit(nine), unit(noon)], {
      avoidConflicts: false,
      blockedSlots: [],
      avoidCalendarEvents: true,
    });
    expect(numbers(result)).toEqual(['AL02']);
  });

  it('reads the source on every run, so a changed event applies at once', () => {
    let slots: WeeklyTimeSlot[] = [eventSlot(9, 10)];
    setCalendarSlotSource(() => slots);
    const filter = new ConflictFilter();
    const criteria = {
      avoidConflicts: false,
      blockedSlots: [],
      avoidCalendarEvents: true,
    };
    const sections = [unit(nine), unit(noon)];

    expect(numbers(filter.apply(sections, criteria))).toEqual(['AL02']);
    slots = [eventSlot(12, 13)];
    expect(numbers(filter.apply(sections, criteria))).toEqual(['AL01']);
    slots = [];
    expect(numbers(filter.apply(sections, criteria))).toEqual(['AL01', 'AL02']);
  });

  it('ignores the calendar without the flag', () => {
    setCalendarSlotSource(() => [eventSlot(9, 10)]);
    const result = new ConflictFilter().apply([unit(nine), unit(noon)], {
      avoidConflicts: true,
      blockedSlots: [],
    });
    expect(numbers(result)).toEqual(['AL01', 'AL02']);
  });

  it('adds nothing when no source is set (the server)', () => {
    const result = new ConflictFilter().apply([unit(nine), unit(noon)], {
      avoidConflicts: true,
      blockedSlots: [],
      avoidCalendarEvents: true,
    });
    expect(numbers(result)).toEqual(['AL01', 'AL02']);
  });

  it('still honours its own blockedSlots next to the calendar', () => {
    setCalendarSlotSource(() => [eventSlot(9, 10)]);
    const result = new ConflictFilter().apply([unit(nine), unit(noon)], {
      avoidConflicts: true,
      blockedSlots: [eventSlot(12, 13)],
      avoidCalendarEvents: true,
    });
    expect(numbers(result)).toEqual([]);
  });

  it('includes the calendar in the blocked masks', () => {
    setCalendarSlotSource(() => [eventSlot(9, 10)]);
    const masks = new ConflictFilter().getBlockedMasksByTerm({
      avoidConflicts: true,
      blockedSlots: [],
      avoidCalendarEvents: true,
    });
    expect(masks.get('A')).not.toBe(0n);
    expect(masks.get('A')).toBeDefined();
  });
});
