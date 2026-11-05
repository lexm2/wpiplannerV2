/**
 * The export file carries everything a schedule is: calendar events, required
 * flags, locked sections and colours round-trip, and files from before those
 * existed (4.3) still import.
 */
import { describe, it, expect } from 'vitest';
import { ApplicationState } from '../../src/types/ApplicationState';
import { ScheduleState } from '../../src/types/ScheduleState';
import { ExportDataSchema } from '../../src/types/export';
import { EventType, type LocalCalendarEvent } from '../../src/types/schedule';
import { DayOfWeek, type Department } from '../../src/types/types';

const course = { id: 'CS-1101-2026', departmentAbbr: 'CS', number: '1101' };
const catalog = [
  { abbreviation: 'CS', courses: [course] },
] as unknown as Department[];

const event: LocalCalendarEvent = {
  id: 'e1',
  title: 'Practice',
  eventType: EventType.RECURRING,
  days: [DayOfWeek.MONDAY],
  startTime: { hours: 17, minutes: 0 },
  endTime: { hours: 19, minutes: 0 },
  visible: true,
  createdAt: 1,
  updatedAt: 1,
};

function roundTrip(state: ApplicationState): ApplicationState {
  const text = JSON.stringify(state.toMinimalFormat());
  return ApplicationState.fromMinimalFormat(
    ExportDataSchema.parse(JSON.parse(text)),
    catalog,
  );
}

describe('export format 4.4', () => {
  it('round-trips events, required flag, locked sections and colour', () => {
    const schedule = new ScheduleState(
      's1',
      'Plan B',
      [
        {
          course,
          selected: {},
          isRequired: true,
          lockedSections: new Set(['111']),
          customColor: '#123456',
        },
      ] as never,
      [],
      1,
      [event],
      2026,
    );
    const back = roundTrip(new ApplicationState('s1', [schedule], undefined))
      .schedules[0];

    expect(back.name).toBe('Plan B');
    expect(back.year).toBe(2026);
    expect(back.localEvents).toEqual([event]);
    const sc = back.selectedCourses[0];
    expect(sc.isRequired).toBe(true);
    expect([...sc.lockedSections]).toEqual(['111']);
    expect(sc.customColor).toBe('#123456');
  });

  it('imports a 4.3 file, which has no extras', () => {
    const parsed = ExportDataSchema.parse({
      v: '4.3',
      a: 0,
      s: [['Old', ['CS-1101-2026', null, null, null], 2025]],
    });
    const state = ApplicationState.fromMinimalFormat(parsed, catalog);
    expect(state.schedules[0].name).toBe('Old');
    expect(state.schedules[0].selectedCourses).toHaveLength(1);
    expect(state.schedules[0].localEvents).toEqual([]);
  });

  it('names an unknown course and imports the known ones', () => {
    const parsed = ExportDataSchema.parse({
      v: '4.4',
      a: 0,
      s: [
        [
          'Mixed',
          ['CS-1101-2026', null, null, null, 'ZZ-9999-2026', null, null, null],
        ],
      ],
    });
    const state = ApplicationState.fromMinimalFormat(parsed, catalog);
    expect(state.schedules[0].selectedCourses).toHaveLength(1);
    expect(state.skippedCourseIds).toEqual([['ZZ-9999-2026']]);
  });

  it('drops a malformed event but keeps the schedule', () => {
    const parsed = ExportDataSchema.parse({
      v: '4.4',
      a: 0,
      s: [['E', [], null, { e: [null, event, { id: 5 }] }]],
    });
    const state = ApplicationState.fromMinimalFormat(parsed, catalog);
    expect(state.schedules[0].localEvents).toEqual([event]);
  });
});
