import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ICSGenerator } from '../../src/utils/icsGenerator';
import { TermBoundsService } from '../../src/utils/termBounds';
import { formatLocalDate, parseLocalDate } from '../../src/utils/localDate';
import {
  AcademicTerm,
  EventType,
  type LocalCalendarEvent,
  type Schedule,
  type SelectedCourse,
} from '../../src/types/schedule';
import {
  DayOfWeek,
  PeriodType,
  type Period,
  type Section,
} from '../../src/types/types';

const M = DayOfWeek.MONDAY;
const T = DayOfWeek.TUESDAY;
const W = DayOfWeek.WEDNESDAY;
const R = DayOfWeek.THURSDAY;
const F = DayOfWeek.FRIDAY;

function bounds(start: string, end: string) {
  return { startDate: start, endDate: end, offeringPeriod: '', sampleSize: 1 };
}

// 2026-08-20 is a Thursday.
const TERM_BOUNDS = {
  generated: '2026-09-01T11:41:35.042Z',
  years: {
    '2026': {
      A: bounds('2026-08-20', '2026-10-09'),
      B: bounds('2026-10-19', '2026-12-11'),
      C: bounds('2027-01-13', '2027-03-05'),
      D: bounds('2027-03-15', '2027-05-05'),
    },
    '2027': {
      A: bounds('2027-08-26', '2027-10-15'),
      B: bounds('2027-10-25', '2027-12-17'),
      C: bounds('2028-01-12', '2028-03-03'),
      D: bounds('2028-03-13', '2028-05-04'),
    },
  },
};

beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(TERM_BOUNDS) }),
    ),
  );
  await TermBoundsService.getInstance().loadTermBounds();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.useRealTimers();
});

function period(days: DayOfWeek[], overrides: Partial<Period> = {}): Period {
  return {
    type: PeriodType.LECTURE,
    professor: 'Prof',
    startTime: { hours: 10, minutes: 0, displayTime: '10:00 AM' },
    endTime: { hours: 10, minutes: 50, displayTime: '10:50 AM' },
    location: 'SL 104',
    building: 'SL',
    room: '104',
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 0,
    days: new Set(days),
    ...overrides,
  };
}

function section(term: AcademicTerm, periods: Period[]): Section {
  return {
    crn: 1234,
    number: `${term}01`,
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 0,
    meetsWith: [],
    isOnlineGrad: false,
    deliveryMode: 'In-Person',
    status: 'Open',
    startDate: '',
    endDate: '',
    computedTerm: term,
    periods,
  };
}

function course(sec: Section, academicYear?: number): SelectedCourse {
  return {
    course: {
      id: 'cs-1101',
      number: '1101',
      name: 'Intro',
      description: '',
      departmentAbbr: 'CS',
      departmentName: 'Computer Science',
      crossListedWith: [],
      degreeAttributes: [],
      courseTypes: [],
      minCredits: 1,
      maxCredits: 1,
      academicYear,
    },
    selected: { lecture: sec },
    isRequired: false,
    lockedSections: new Set(),
  };
}

function schedule(
  courses: SelectedCourse[],
  localEvents: LocalCalendarEvent[] = [],
  year?: number,
): Schedule {
  return {
    id: 's',
    name: 'Test',
    selectedCourses: courses,
    generatedSchedules: [],
    localEvents,
    year,
  };
}

function recurring(
  terms: AcademicTerm[],
  days: DayOfWeek[],
): LocalCalendarEvent {
  return {
    id: 'ev',
    title: 'Practice',
    eventType: EventType.RECURRING,
    days,
    terms,
    startTime: { hours: 18, minutes: 0 },
    endTime: { hours: 19, minutes: 0 },
    visible: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

function exportICS(s: Schedule): string {
  const result = ICSGenerator.generateICS(s);
  expect(result.error).toBeUndefined();
  expect(result.success).toBe(true);
  return result.data!;
}

function lines(ics: string, prefix: string): string[] {
  return ics.split('\r\n').filter(l => l.startsWith(prefix));
}

describe('localDate', () => {
  it('parses a date-only string as local midnight', () => {
    const d = parseLocalDate('2026-08-20');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([
      2026, 7, 20, 0,
    ]);
  });

  it('formats the local calendar day, not the UTC one', () => {
    // 11pm local is the next day in UTC for any zone west of Greenwich.
    expect(formatLocalDate(new Date(2026, 9, 11, 23, 30))).toBe('2026-10-11');
    expect(formatLocalDate(new Date(2026, 0, 5, 0, 15))).toBe('2026-01-05');
  });
});

describe('TermBoundsService.getTermDates', () => {
  it('returns local-midnight dates for the term bounds', () => {
    const range = TermBoundsService.getInstance().getTermDates('A', 2026)!;
    expect(formatLocalDate(range.start)).toBe('2026-08-20');
    expect(formatLocalDate(range.end)).toBe('2026-10-09');
    expect(range.start.getHours()).toBe(0);
  });

  it('returns null for a term letter the data lacks instead of throwing', () => {
    const service = TermBoundsService.getInstance();
    expect(service.getTermDates('F' as 'A', 2026)).toBeNull();
    expect(service.getTermDates('A', 1999)).toBeNull();
  });
});

describe('ICSGenerator.getTermDates', () => {
  const span = (term: string) => {
    const r = ICSGenerator.getTermDates(term, 2026);
    return r && [formatLocalDate(r.start), formatLocalDate(r.end)];
  };

  it('spans the quarters a semester or whole-year term covers', () => {
    expect(span('A')).toEqual(['2026-08-20', '2026-10-09']);
    expect(span('F')).toEqual(['2026-08-20', '2026-12-11']);
    expect(span('S')).toEqual(['2027-01-13', '2027-05-05']);
    expect(span('ALL')).toEqual(['2026-08-20', '2027-05-05']);
  });

  it('returns null for unknown terms', () => {
    expect(span('TBA')).toBeNull();
    expect(span('')).toBeNull();
  });
});

describe('ICSGenerator.findFirstMeetingDate', () => {
  it('picks the earliest meeting day on or after term start', () => {
    const thursday = parseLocalDate('2026-08-20');
    const first = (days: DayOfWeek[]) =>
      formatLocalDate(ICSGenerator.findFirstMeetingDate(thursday, days)!);
    expect(first([M, W, F])).toBe('2026-08-21');
    expect(first([F, M])).toBe('2026-08-21');
    expect(first([T, R])).toBe('2026-08-20');
    expect(first([M])).toBe('2026-08-24');
    expect(ICSGenerator.findFirstMeetingDate(thursday, [])).toBeNull();
  });
});

describe('ICSGenerator.generateICS', () => {
  it('starts an MWF class on the first Friday when term starts Thursday', () => {
    const ics = exportICS(
      schedule([course(section(AcademicTerm.A, [period([M, W, F])]), 2026)]),
    );
    expect(lines(ics, 'DTSTART')).toEqual([
      'DTSTART;TZID=America/New_York:20260821T100000',
    ]);
    const [rrule] = lines(ics, 'RRULE');
    // 23:59:59 EDT on Oct 9 is 03:59:59 UTC on Oct 10.
    expect(rrule).toContain('UNTIL=20261010T035959Z');
    expect(rrule).toContain('BYDAY=MO,WE,FR');
  });

  it('exports semester sections instead of failing the whole export', () => {
    const ics = exportICS(
      schedule([course(section(AcademicTerm.F, [period([T, R])]), 2026)]),
    );
    expect(lines(ics, 'DTSTART')).toEqual([
      'DTSTART;TZID=America/New_York:20260820T100000',
    ]);
    // Through the end of B term, Dec 11 (EST, so +5h).
    expect(lines(ics, 'RRULE')[0]).toContain('UNTIL=20261212T045959Z');
  });

  it('gives same-type periods on the same day distinct UIDs', () => {
    const ics = exportICS(
      schedule([
        course(
          section(AcademicTerm.A, [
            period([M]),
            period([M], {
              startTime: { hours: 14, minutes: 0, displayTime: '2:00 PM' },
              endTime: { hours: 14, minutes: 50, displayTime: '2:50 PM' },
            }),
          ]),
          2026,
        ),
      ]),
    );
    const uids = lines(ics, 'UID');
    expect(uids).toHaveLength(2);
    expect(new Set(uids).size).toBe(2);
  });

  it('exports a one-time local event on its own day', () => {
    const event: LocalCalendarEvent = {
      ...recurring([], []),
      eventType: EventType.ONE_TIME,
      date: '2026-09-15',
    };
    const ics = exportICS(schedule([], [event]));
    expect(lines(ics, 'DTSTART')).toEqual([
      'DTSTART;TZID=America/New_York:20260915T180000',
    ]);
  });

  it('spans the whole year for a recurring local event marked ALL', () => {
    const ics = exportICS(
      schedule([], [recurring([AcademicTerm.ALL], [M, W])], 2026),
    );
    expect(lines(ics, 'DTSTART')).toEqual([
      'DTSTART;TZID=America/New_York:20260824T180000',
    ]);
    expect(lines(ics, 'RRULE')[0]).toContain('UNTIL=20270506T035959Z');
  });

  it("uses the schedule's year for recurring local events", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 11));
    const ics = exportICS(
      schedule([], [recurring([AcademicTerm.A], [R])], 2027),
    );
    expect(lines(ics, 'DTSTART')).toEqual([
      'DTSTART;TZID=America/New_York:20270826T180000',
    ]);
  });
});
