/** buildTermBlocks: a class over a calendar event is a conflict on the grid. */
import { describe, expect, it } from 'vitest';
import { buildTermBlocks } from '../../src/svelte/schedule/scheduleGeometry';
import {
  DayOfWeek,
  PeriodType,
  type Course,
  type Section,
} from '../../src/types/types';
import {
  AcademicTerm,
  EventType,
  type LocalCalendarEvent,
  type SelectedCourse,
} from '../../src/types/schedule';

function lecture(startHour: number, endHour: number): Section {
  return {
    crn: 8001,
    number: 'BL01',
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 0,
    computedTerm: AcademicTerm.B,
    periods: [
      {
        type: PeriodType.LECTURE,
        professor: 'Prof X',
        startTime: { hours: startHour, minutes: 0 },
        endTime: { hours: endHour, minutes: 0 },
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

const course = {
  id: 'CS2102',
  departmentAbbr: 'CS',
  number: '2102',
} as Course;

function selected(section: Section): SelectedCourse {
  return {
    course,
    selected: { lecture: section },
    isRequired: false,
    lockedSections: new Set(),
  };
}

function shift(
  terms: AcademicTerm[],
  startHour: number,
  endHour: number,
): LocalCalendarEvent {
  return {
    id: 'local-1',
    title: 'Work Shift',
    description: 'Library desk',
    eventType: EventType.RECURRING,
    days: [DayOfWeek.MONDAY],
    startTime: { hours: startHour, minutes: 0 },
    endTime: { hours: endHour, minutes: 0 },
    terms,
    visible: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function build(
  events: LocalCalendarEvent[],
  hover: SelectedCourse | null = null,
  main: SelectedCourse[] = [selected(lecture(9, 11))],
) {
  return buildTermBlocks(main, hover, events, 'B', new Map(), () => '#123');
}

describe('buildTermBlocks event conflicts', () => {
  it('marks a class overlapping an event, naming both', () => {
    const { blocks, hasConflict } = build([shift([AcademicTerm.B], 10, 12)]);
    const overlay = blocks.find(b => b.kind === 'conflict');
    expect(hasConflict).toBe(true);
    expect(overlay).toMatchObject({
      conflictInfo: 'CS2102 BL01, Work Shift',
      startMin: 600,
      endMin: 660,
    });
  });

  it('ignores an event on another term, or one that only touches', () => {
    expect(build([shift([AcademicTerm.A], 10, 12)]).hasConflict).toBe(false);
    expect(build([shift([AcademicTerm.B], 11, 12)]).hasConflict).toBe(false);
  });

  it('never registers a hover preview as a conflict', () => {
    const result = build(
      [shift([AcademicTerm.B], 10, 12)],
      selected(lecture(9, 11)),
      [],
    );
    expect(result.hasConflict).toBe(false);
    expect(result.blocks.some(b => b.kind === 'conflict')).toBe(false);
  });

  it('gives event blocks their time range and description', () => {
    const ev = build([shift([AcademicTerm.B], 10, 12)]).blocks.find(
      b => b.kind === 'event',
    );
    expect(ev?.timeRange).toBe('10:00 AM-12:00 PM');
    expect(ev?.description).toBe('Library desk');
  });
});
