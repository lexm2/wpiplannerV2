/**
 * ScheduleScorer: idle minutes are counted per quarter and day, semester
 * sections (F, S) weigh in on both of their quarters, and sortBest puts the
 * best schedule first without reshuffling ties.
 */
import { describe, it, expect } from 'vitest';
import { ScheduleScorer } from '../../src/services/scheduling/ScheduleScorer';
import type { ScheduleResult } from '../../src/services/scheduling/AutoScheduler';
import type { Section } from '../../src/types/types';

interface Slot {
  days: string;
  start: string;
  end: string;
  isAsync?: boolean;
}

function time(hhmm: string) {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return { hours, minutes, displayTime: hhmm };
}

function section(term: string, ...slots: Slot[]): Section {
  return {
    computedTerm: term,
    periods: slots.map(s => ({
      startTime: time(s.start),
      endTime: time(s.end),
      days: new Set(s.days.split('')),
      isAsync: s.isAsync,
    })),
  } as unknown as Section;
}

let n = 0;
function course(lecture: Section, lab?: Section): ScheduleResult {
  return {
    course: { id: `c${n++}` },
    combination: lab ? { lecture, lab } : { lecture },
  } as unknown as ScheduleResult;
}

const scorer = new ScheduleScorer();
const internals = scorer as unknown as {
  gapMinutes(s: ScheduleResult[]): number;
  termScore(s: ScheduleResult[]): number;
};
const gap = (...s: ScheduleResult[]) => internals.gapMinutes(s);
const terms = (...s: ScheduleResult[]) => internals.termScore(s);

const MON_9 = { days: 'M', start: '9:00', end: '9:50' };
const MON_11 = { days: 'M', start: '11:00', end: '11:50' };
const MON_14 = { days: 'M', start: '14:00', end: '14:50' };

describe('ScheduleScorer gap minutes', () => {
  it('counts idle time between classes on the same day and quarter', () => {
    expect(gap(course(section('A', MON_9)), course(section('A', MON_11)))).toBe(
      70,
    );
  });

  it('sums consecutive gaps whatever order the courses arrive in', () => {
    expect(
      gap(
        course(section('A', MON_14)),
        course(section('A', MON_9)),
        course(section('A', MON_11)),
      ),
    ).toBe(70 + 130);
  });

  it('includes gaps between a lecture and its own lab', () => {
    expect(gap(course(section('A', MON_9), section('A', MON_11)))).toBe(70);
  });

  it('ignores classes on different days or in different quarters', () => {
    const tue11 = { ...MON_11, days: 'T' };
    expect(gap(course(section('A', MON_9)), course(section('A', tue11)))).toBe(
      0,
    );
    expect(gap(course(section('A', MON_9)), course(section('B', MON_11)))).toBe(
      0,
    );
  });

  it('counts each day of a multi-day period', () => {
    const mw9 = { ...MON_9, days: 'MW' };
    const mw11 = { ...MON_11, days: 'MW' };
    expect(gap(course(section('C', mw9)), course(section('C', mw11)))).toBe(
      140,
    );
  });

  it('does not go negative for overlapping or back-to-back classes', () => {
    const overlap = { days: 'M', start: '9:30', end: '10:20' };
    const after = { days: 'M', start: '9:50', end: '10:40' };
    expect(
      gap(course(section('A', MON_9)), course(section('A', overlap))),
    ).toBe(0);
    expect(gap(course(section('A', MON_9)), course(section('A', after)))).toBe(
      0,
    );
  });

  it('skips async periods', () => {
    const asyncSlot = {
      days: 'M',
      start: '12:00',
      end: '12:00',
      isAsync: true,
    };
    expect(
      gap(course(section('A', MON_9)), course(section('A', asyncSlot))),
    ).toBe(0);
  });

  it('places an F section in both A and B', () => {
    const fall = course(section('F', MON_9));
    expect(gap(fall, course(section('A', MON_11)))).toBe(70);
    expect(gap(fall, course(section('B', MON_11)))).toBe(70);
    expect(gap(fall, course(section('C', MON_11)))).toBe(0);
  });

  it('places an S section in both C and D', () => {
    const spring = course(section('S', MON_9));
    expect(gap(spring, course(section('C', MON_11)))).toBe(70);
    expect(gap(spring, course(section('D', MON_11)))).toBe(70);
    expect(gap(spring, course(section('A', MON_11)))).toBe(0);
  });
});

describe('ScheduleScorer term balance', () => {
  it('scores three courses in each quarter as perfect', () => {
    const quarter = (t: string) =>
      [0, 1, 2].map(() => course(section(t, MON_9)));
    expect(terms(...quarter('A'), ...quarter('B'))).toBe(100);
  });

  it('counts an F section like one A plus one B section', () => {
    expect(terms(course(section('F', MON_9)))).toBe(
      terms(course(section('A', MON_9)), course(section('B', MON_9))),
    );
    const threeF = [0, 1, 2].map(() => course(section('F', MON_9)));
    expect(terms(...threeF)).toBe(100);
  });

  it('counts an S section like one C plus one D section', () => {
    expect(terms(course(section('S', MON_9)))).toBe(
      terms(course(section('C', MON_9)), course(section('D', MON_9))),
    );
  });

  it('counts a course once, by its first section', () => {
    // An A lecture with a B lab still counts as one A course.
    expect(terms(course(section('A', MON_9), section('B', MON_11)))).toBe(
      terms(course(section('A', MON_9))),
    );
  });
});

describe('ScheduleScorer.sortBest', () => {
  it('puts the higher score first, gaps breaking a term-balance tie', () => {
    const gappy = [course(section('A', MON_9)), course(section('A', MON_14))];
    const tight = [course(section('A', MON_9)), course(section('A', MON_11))];
    const balanced = [0, 1, 2].map(() => course(section('A', MON_9)));

    const sorted = scorer.sortBest([gappy, tight, balanced]);
    expect(sorted).toEqual([balanced, tight, gappy]);
    expect(scorer.score(tight)).toBeGreaterThan(scorer.score(gappy));
  });

  it('sorts in place and keeps ties in their original order', () => {
    const tied = [0, 1, 2, 3].map(() => [course(section('A', MON_9))]);
    const better = [0, 1, 2].map(() => course(section('A', MON_9)));
    const input = [tied[0], tied[1], better, tied[2], tied[3]];

    const sorted = scorer.sortBest(input);
    expect(sorted).toBe(input);
    expect(sorted).toEqual([better, ...tied]);
    for (let i = 0; i < tied.length; i++) {
      expect(sorted[i + 1]).toBe(tied[i]);
    }
  });
});
