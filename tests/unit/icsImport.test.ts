import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  IcsImportError,
  importIcsText,
  parseIcsOccurrences,
} from '../../src/services/scheduling/icsImport';
import {
  detectWeeklyEvents,
  matchesExistingEvent,
  type ParsedCalendar,
  type TermWindow,
  type WeeklyEventCandidate,
} from '../../src/services/scheduling/weeklyEventDetection';
import {
  AcademicTerm,
  EventType,
  type LocalCalendarEvent,
} from '../../src/types/schedule';
import { DayOfWeek } from '../../src/types/types';

const M = DayOfWeek.MONDAY;
const T = DayOfWeek.TUESDAY;
const W = DayOfWeek.WEDNESDAY;
const R = DayOfWeek.THURSDAY;
const F = DayOfWeek.FRIDAY;

function window(term: TermWindow['term'], start: string, end: string) {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  return {
    term,
    start: new Date(sy, sm - 1, sd),
    end: new Date(ey, em - 1, ed),
  };
}

// 2026-27 windows, as public/term-bounds.json gives them.
const TERMS: TermWindow[] = [
  window('A', '2026-08-20', '2026-10-09'),
  window('B', '2026-10-19', '2026-12-11'),
  window('C', '2027-01-13', '2027-03-05'),
  window('D', '2027-03-15', '2027-05-05'),
];

function ics(...events: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

function vevent(lines: string[], uid = 'e1'): string {
  return ['BEGIN:VEVENT', `UID:${uid}`, ...lines, 'END:VEVENT'].join('\r\n');
}

const NY_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
].join('\r\n');

const hm = (hours: number, minutes = 0) => ({ hours, minutes });

describe('canonical Google-style fixture', () => {
  const text = readFileSync('tests/fixtures/ics/weekly-sample.ics', 'utf8');

  it('detects exactly the expected weekly events', () => {
    const result = importIcsText(text, TERMS);
    expect(
      result.candidates.map(c => ({
        title: c.title,
        days: c.days,
        terms: c.terms,
        start: c.startTime,
        end: c.endTime,
        location: c.location,
        coverage: c.coverage,
      })),
    ).toEqual([
      {
        title: 'Gym',
        days: [F],
        terms: [AcademicTerm.B],
        start: hm(7),
        end: hm(8),
        location: undefined,
        coverage: { B: { met: 8, possible: 8 } },
      },
      {
        title: 'Study Group',
        days: [T],
        terms: [AcademicTerm.A],
        start: hm(18),
        end: hm(19, 30),
        location: undefined,
        coverage: { A: { met: 4, possible: 7 } },
      },
      {
        title: 'Tutoring',
        days: [M, W],
        terms: [AcademicTerm.A],
        start: hm(15),
        end: hm(16),
        location: undefined,
        coverage: { A: { met: 7, possible: 7 } },
      },
      {
        title: 'Tutoring',
        days: [M],
        terms: [AcademicTerm.B],
        start: hm(15),
        end: hm(16),
        location: undefined,
        coverage: { B: { met: 8, possible: 8 } },
      },
      {
        title: 'Work Shift',
        days: [M, W],
        terms: [AcademicTerm.A, AcademicTerm.B],
        start: hm(9),
        end: hm(11),
        location: 'Gordon Library',
        coverage: { A: { met: 6, possible: 7 }, B: { met: 8, possible: 8 } },
      },
    ]);
    expect(result.skipped).toEqual({
      occasional: 3,
      weekend: 1,
      outsideTerms: 1,
      allDay: 1,
      cancelled: 1,
      overnight: 0,
      tooDense: 0,
    });
    expect(result.span).toEqual({ first: '2026-06-01', last: '2026-12-11' });
  });

  it('gives each candidate a distinct key', () => {
    const keys = importIcsText(text, TERMS).candidates.map(c => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/** Candidate summary for compact assertions. */
function summarize(text: string, terms = TERMS) {
  return importIcsText(text, terms).candidates.map(c => ({
    title: c.title,
    days: c.days,
    terms: c.terms,
    start: c.startTime.hours * 60 + c.startTime.minutes,
    end: c.endTime.hours * 60 + c.endTime.minutes,
  }));
}

describe('30% threshold', () => {
  // Term A Thursdays: Aug 20 .. Oct 8 = 8; Tuesdays Aug 25 .. Oct 6 = 7.
  const weeklyTue = (count: number) =>
    ics(
      vevent([
        'DTSTART;TZID=America/New_York:20260825T100000',
        'DTEND;TZID=America/New_York:20260825T110000',
        `RRULE:FREQ=WEEKLY;COUNT=${count};BYDAY=TU`,
        'SUMMARY:Seminar',
      ]),
    );

  it('2 of 7 weeks fails, 3 of 7 passes', () => {
    expect(summarize(weeklyTue(2))).toEqual([]);
    expect(summarize(weeklyTue(3))).toHaveLength(1);
  });

  const calendarOf = (
    occurrences: ParsedCalendar['occurrences'],
  ): ParsedCalendar => ({
    occurrences,
    span: null,
    dropped: {
      allDay: 0,
      overnight: 0,
      cancelled: 0,
      tooDense: 0,
      outsideWindow: 0,
    },
  });

  it('3 of 10 passes exactly at the boundary, with no float error', () => {
    // A 10-Tuesday window: 2026-09-01 .. 2026-11-03 holds Sep 1,8,...,Nov 3.
    const ten = [window('A', '2026-09-01', '2026-11-03')];
    const dates = (n: number) => {
      const p = calendarOf([]);
      p.occurrences = ['09-01', '09-08', '09-15'].slice(0, n).map(d => ({
        uid: 'u',
        title: 'X',
        date: `2026-${d}`,
        day: T,
        startMin: 600,
        endMin: 660,
      }));
      return p;
    };
    expect(detectWeeklyEvents(dates(3), ten, 0.3).candidates).toHaveLength(1);
    expect(detectWeeklyEvents(dates(2), ten, 0.3).candidates).toHaveLength(0);
  });

  it('2 of 6 passes and 2 of 7 fails', () => {
    const occ = (date: string) => ({
      uid: 'u',
      title: 'X',
      date,
      day: T,
      startMin: 600,
      endMin: 660,
    });
    const calendar: ParsedCalendar = {
      occurrences: [occ('2026-09-01'), occ('2026-09-08')],
      span: null,
      dropped: {
        allDay: 0,
        overnight: 0,
        cancelled: 0,
        tooDense: 0,
        outsideWindow: 0,
      },
    };
    const six = [window('A', '2026-09-01', '2026-10-06')]; // 6 Tuesdays
    const seven = [window('A', '2026-09-01', '2026-10-13')]; // 7 Tuesdays
    expect(detectWeeklyEvents(calendar, six).candidates).toHaveLength(1);
    expect(detectWeeklyEvents(calendar, seven).candidates).toHaveLength(0);
  });
});

describe('time zones', () => {
  it('keeps a TZID=America/New_York event at the same wall time across DST', () => {
    const text = ics(
      NY_VTIMEZONE,
      vevent([
        'DTSTART;TZID=America/New_York:20261019T100000',
        'DTEND;TZID=America/New_York:20261019T110000',
        'RRULE:FREQ=WEEKLY;UNTIL=20261212T045959Z;BYDAY=MO',
        'SUMMARY:Lab',
      ]),
    );
    expect(summarize(text)).toEqual([
      {
        title: 'Lab',
        days: [M],
        terms: [AcademicTerm.B],
        start: 600,
        end: 660,
      },
    ]);
  });

  it('shifts a UTC-anchored weekly event by an hour after Nov 1', () => {
    const text = ics(
      vevent([
        'DTSTART:20261019T140000Z',
        'DTEND:20261019T150000Z',
        'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261212T000000Z',
        'SUMMARY:Call',
      ]),
    );
    const parsed = parseIcsOccurrences(text, TERMS[1]);
    const byDate = new Map(parsed.occurrences.map(o => [o.date, o.startMin]));
    expect(byDate.get('2026-10-26')).toBe(10 * 60); // EDT
    expect(byDate.get('2026-11-02')).toBe(9 * 60); // EST
  });

  it('converts a UTC event to Eastern', () => {
    const text = ics(
      vevent([
        'DTSTART:20260824T130000Z',
        'DTEND:20260824T143000Z',
        'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=7',
        'SUMMARY:Standup',
      ]),
    );
    expect(summarize(text)[0]).toMatchObject({ start: 9 * 60, end: 10.5 * 60 });
  });

  it('takes floating times as-is', () => {
    const text = ics(
      vevent([
        'DTSTART:20260824T090000',
        'DTEND:20260824T100000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=7',
        'SUMMARY:Floating',
      ]),
    );
    expect(summarize(text)[0]).toMatchObject({ start: 9 * 60, end: 10 * 60 });
  });

  it('reads an IANA TZID without a VTIMEZONE (Chicago 09:00 is 10:00 Eastern)', () => {
    const text = ics(
      vevent([
        'DTSTART;TZID=America/Chicago:20260824T090000',
        'DTEND;TZID=America/Chicago:20260824T100000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=7',
        'SUMMARY:Chicago Class',
      ]),
    );
    expect(summarize(text)[0]).toMatchObject({ start: 10 * 60, end: 11 * 60 });
  });

  it('maps a Windows TZID without a VTIMEZONE', () => {
    const text = ics(
      vevent([
        'DTSTART;TZID=Pacific Standard Time:20260824T090000',
        'DTEND;TZID=Pacific Standard Time:20260824T100000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=7',
        'SUMMARY:West Coast',
      ]),
    );
    expect(summarize(text)[0]).toMatchObject({ start: 12 * 60 });
  });

  it('honors a custom target timezone', () => {
    const text = ics(
      vevent([
        'DTSTART:20260824T130000Z',
        'DTEND:20260824T140000Z',
        'SUMMARY:One off',
      ]),
    );
    const parsed = parseIcsOccurrences(text, TERMS[0], 'America/Chicago');
    expect(parsed.occurrences[0].startMin).toBe(8 * 60);
  });

  it('reads an Outlook-style file: Windows TZID + VTIMEZONE, folded lines, X- props', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'METHOD:PUBLISH',
      'PRODID:Microsoft Exchange Server 2010',
      'VERSION:2.0',
      'X-WR-CALNAME:Calendar',
      'BEGIN:VTIMEZONE',
      'TZID:Eastern Standard Time',
      'BEGIN:STANDARD',
      'DTSTART:16010101T020000',
      'TZOFFSETFROM:-0400',
      'TZOFFSETTO:-0500',
      'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=1SU;BYMONTH=11',
      'END:STANDARD',
      'BEGIN:DAYLIGHT',
      'DTSTART:16010101T020000',
      'TZOFFSETFROM:-0500',
      'TZOFFSETTO:-0400',
      'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=2SU;BYMONTH=3',
      'END:DAYLIGHT',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'UID:040000008200E00074C5B7101A82E008',
      'SUMMARY:Organic Chemistry Lec',
      ' ture',
      'DTSTART;TZID=Eastern Standard Time:20260824T130000',
      'DTEND;TZID=Eastern Standard Time:20260824T135000',
      'RRULE:FREQ=WEEKLY;UNTIL=20261211T000000Z;INTERVAL=1;BYDAY=MO,WE,FR;WKST=SU',
      'LOCATION:Olin Hall 1',
      ' 12',
      'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
      'X-MICROSOFT-CDO-ALLDAYEVENT:FALSE',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const result = importIcsText(text, TERMS);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      title: 'Organic Chemistry Lecture',
      location: 'Olin Hall 112',
      days: [M, W, F],
      terms: [AcademicTerm.A, AcademicTerm.B],
      startTime: hm(13),
      endTime: hm(13, 50),
    });
  });
});

describe('edge cases', () => {
  it('counts a calendar entirely in 2024-25 as outside the terms', () => {
    const text = ics(
      vevent([
        'DTSTART;TZID=America/New_York:20240826T090000',
        'DTEND;TZID=America/New_York:20240826T100000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20241213T000000Z',
        'SUMMARY:Old class',
      ]),
    );
    const result = importIcsText(text, TERMS);
    expect(result.candidates).toEqual([]);
    expect(result.skipped.outsideTerms).toBe(1);
    expect(result.span).toEqual({ first: '2024-08-26', last: '2024-12-09' });
  });

  it('expands FREQ=DAILY from 2015 with no end, quickly', () => {
    const text = ics(
      vevent([
        'DTSTART;TZID=America/New_York:20150105T080000',
        'DTEND;TZID=America/New_York:20150105T083000',
        'RRULE:FREQ=DAILY',
        'SUMMARY:Meds',
      ]),
    );
    const started = Date.now();
    const result = importIcsText(text, TERMS);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(result.skipped.tooDense).toBe(0);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].days).toEqual([M, T, W, R, F]);
    expect(result.candidates[0].terms).toEqual([
      AcademicTerm.A,
      AcademicTerm.B,
      AcademicTerm.C,
      AcademicTerm.D,
    ]);
  });

  it('expands FREQ=DAILY from 1995 without calling it too dense', () => {
    const text = ics(
      vevent([
        'DTSTART:19950102T130000Z',
        'DTEND:19950102T133000Z',
        'RRULE:FREQ=DAILY',
        'SUMMARY:Walk',
      ]),
    );
    const started = Date.now();
    const result = importIcsText(text, TERMS);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.skipped.tooDense).toBe(0);
    expect(result.candidates.map(c => c.days)).toContainEqual([M, T, W, R, F]);
  });

  it('ignores a second copy of the same event instead of dropping both', () => {
    const copy = vevent([
      'DTSTART;TZID=America/New_York:20260824T090000',
      'DTEND;TZID=America/New_York:20260824T100000',
      'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=7',
      'SUMMARY:Shift',
    ]);
    const result = importIcsText(ics(NY_VTIMEZONE, copy, copy), TERMS);
    expect(result.candidates.map(c => c.title)).toEqual(['Shift']);
  });

  it('reads every moved instance whose master is missing from the file', () => {
    const moved = (date: string) =>
      vevent(
        [
          `RECURRENCE-ID;TZID=America/New_York:${date}T090000`,
          `DTSTART;TZID=America/New_York:${date}T100000`,
          `DTEND;TZID=America/New_York:${date}T110000`,
          'SUMMARY:Office Hours',
        ],
        'series-1',
      );
    // Mondays of A term: 3 of 7 is enough.
    const text = ics(
      NY_VTIMEZONE,
      moved('20260824'),
      moved('20260831'),
      moved('20260914'),
    );
    const result = importIcsText(text, TERMS);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].coverage.A).toEqual({ met: 3, possible: 7 });
  });

  it('counts FREQ=MINUTELY as too dense and returns quickly', () => {
    const text = ics(
      vevent([
        'DTSTART;TZID=America/New_York:20260105T080000',
        'DTEND;TZID=America/New_York:20260105T080100',
        'RRULE:FREQ=MINUTELY',
        'SUMMARY:Spam',
      ]),
    );
    const started = Date.now();
    const result = importIcsText(text, TERMS);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(result.skipped.tooDense).toBe(1);
    expect(result.candidates).toEqual([]);
  });

  it('counts an overnight-only event as overnight', () => {
    const text = ics(
      vevent([
        'DTSTART;TZID=America/New_York:20260824T220000',
        'DTEND;TZID=America/New_York:20260825T020000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=7',
        'SUMMARY:Night Shift',
      ]),
    );
    const result = importIcsText(text, TERMS);
    expect(result.skipped.overnight).toBe(1);
    expect(result.candidates).toEqual([]);
  });

  it('uses Untitled Event for an empty SUMMARY and synthesizes missing UIDs', () => {
    const text = ics(
      [
        'BEGIN:VEVENT',
        'DTSTART:20260824T090000',
        'DTEND:20260824T100000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=7',
        'SUMMARY:   ',
        'END:VEVENT',
      ].join('\r\n'),
    );
    const parsed = parseIcsOccurrences(text, TERMS[0]);
    expect(parsed.occurrences[0].title).toBe('Untitled Event');
    expect(parsed.occurrences[0].uid).toMatch(/^no-uid-/);
  });

  it('reports a null span for a calendar with no events', () => {
    const result = importIcsText(ics(), TERMS);
    expect(result.span).toBeNull();
    expect(result.candidates).toEqual([]);
  });

  it('splits a candidate whose weekdays differ between terms', () => {
    const text = ics(
      vevent(
        [
          'DTSTART;TZID=America/New_York:20260824T100000',
          'DTEND;TZID=America/New_York:20260824T110000',
          'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261010T000000Z',
          'SUMMARY:Section',
        ],
        'a',
      ),
      vevent(
        [
          'DTSTART;TZID=America/New_York:20261019T100000',
          'DTEND;TZID=America/New_York:20261019T110000',
          'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261212T000000Z',
          'SUMMARY:Section',
        ],
        'b',
      ),
    );
    expect(summarize(text)).toEqual([
      { title: 'Section', days: [M, W], terms: ['A'], start: 600, end: 660 },
      { title: 'Section', days: [T, R], terms: ['B'], start: 600, end: 660 },
    ]);
  });
});

describe('invalid input', () => {
  it.each([
    ['garbage text', 'hello, this is not a calendar'],
    ['an empty string', ''],
    ['a vCard', 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada\r\nEND:VCARD\r\n'],
    ['a truncated calendar', 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\n'],
  ])('throws IcsImportError for %s', (_name, text) => {
    expect(() => importIcsText(text, TERMS)).toThrow(IcsImportError);
  });
});

describe('matchesExistingEvent', () => {
  const candidate: WeeklyEventCandidate = {
    key: 'k',
    title: 'Work Shift',
    days: [M, W],
    terms: [AcademicTerm.A, AcademicTerm.B],
    startTime: hm(9),
    endTime: hm(11),
    coverage: {},
  };
  const existing: LocalCalendarEvent = {
    id: '1',
    title: ' work  shift ',
    eventType: EventType.RECURRING,
    days: [W, M],
    terms: [AcademicTerm.B, AcademicTerm.A],
    startTime: hm(9),
    endTime: hm(11),
    visible: true,
    createdAt: 0,
    updatedAt: 0,
  };

  it('matches regardless of array order and title case or spacing', () => {
    expect(matchesExistingEvent(candidate, existing)).toBe(true);
  });

  it('rejects differing days, terms, times, or one-time events', () => {
    expect(matchesExistingEvent(candidate, { ...existing, days: [M] })).toBe(
      false,
    );
    expect(
      matchesExistingEvent(candidate, {
        ...existing,
        terms: [AcademicTerm.A],
      }),
    ).toBe(false);
    expect(
      matchesExistingEvent(candidate, { ...existing, endTime: hm(12) }),
    ).toBe(false);
    expect(
      matchesExistingEvent(candidate, {
        ...existing,
        eventType: EventType.ONE_TIME,
      }),
    ).toBe(false);
  });
});
