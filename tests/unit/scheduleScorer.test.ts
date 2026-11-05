/**
 * ScheduleScorer: every criterion's penalty on small hand-built schedules,
 * with idle minutes counted per quarter and day and semester sections (F, S)
 * weighing in on both of their quarters.
 */
import { describe, it, expect } from 'vitest';
import {
  ScheduleScorer,
  type ScoredSelection,
} from '../../src/services/scheduling/ScheduleScorer';
import {
  normalizeRankingPreferences,
  IMPORTANCE_WEIGHT,
} from '../../src/services/scheduling/rankingPreferences';
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

function section(
  term: string,
  slots: Slot[],
  extra: Partial<Section> = {},
): Section {
  return {
    computedTerm: term,
    seats: 30,
    seatsAvailable: 5,
    status: 'Open',
    periods: slots.map(s => ({
      startTime: time(s.start),
      endTime: time(s.end),
      days: new Set(s.days.split('')),
      isAsync: s.isAsync,
    })),
    ...extra,
  } as unknown as Section;
}

function pick(
  term: string,
  slot: Slot | Slot[],
  extra: Partial<Section> = {},
  rating?: number | null,
): ScoredSelection {
  return {
    combination: {
      lecture: section(term, Array.isArray(slot) ? slot : [slot], extra),
    },
    term,
    ...(rating !== undefined && { rating }),
  };
}

const MON_9 = { days: 'M', start: '9:00', end: '9:50' };
const MON_11 = { days: 'M', start: '11:00', end: '11:50' };
const MON_14 = { days: 'M', start: '14:00', end: '14:50' };

/** Default preferences with the given criteria overridden. */
const scorerWith = (over: Record<string, unknown> = {}) =>
  new ScheduleScorer(normalizeRankingPreferences(over));

/** Only `over` is on: everything else switched off. */
function only(over: Record<string, unknown>) {
  const off = {
    gaps: { importance: 'off' },
    termBalance: { importance: 'off' },
    openSeats: { importance: 'off' },
  };
  return scorerWith({ ...off, ...over });
}

const W = IMPORTANCE_WEIGHT;
const defaultGap = (...s: ScoredSelection[]) =>
  scorerWith().groupCost(s) / W.medium;

describe('ScheduleScorer idle minutes (default gaps)', () => {
  it('counts idle time between classes on the same day and quarter', () => {
    expect(defaultGap(pick('A', MON_9), pick('A', MON_11))).toBe(70);
  });

  it('sums consecutive gaps whatever order the courses arrive in', () => {
    expect(
      defaultGap(pick('A', MON_14), pick('A', MON_9), pick('A', MON_11)),
    ).toBe(70 + 130);
  });

  it('includes gaps between a lecture and its own lab', () => {
    const selection: ScoredSelection = {
      combination: {
        lecture: section('A', [MON_9]),
        lab: section('A', [MON_11]),
      },
      term: 'A',
    };
    expect(defaultGap(selection)).toBe(70);
  });

  it('ignores classes on different days or in different quarters', () => {
    const tue11 = { ...MON_11, days: 'T' };
    expect(defaultGap(pick('A', MON_9), pick('A', tue11))).toBe(0);
    expect(defaultGap(pick('A', MON_9), pick('B', MON_11))).toBe(0);
  });

  it('counts each day of a multi-day period', () => {
    const mw9 = { ...MON_9, days: 'MW' };
    const mw11 = { ...MON_11, days: 'MW' };
    expect(defaultGap(pick('C', mw9), pick('C', mw11))).toBe(140);
  });

  it('does not go negative for overlapping or back-to-back classes', () => {
    const overlap = { days: 'M', start: '9:30', end: '10:20' };
    const after = { days: 'M', start: '9:50', end: '10:40' };
    expect(defaultGap(pick('A', MON_9), pick('A', overlap))).toBe(0);
    expect(defaultGap(pick('A', MON_9), pick('A', after))).toBe(0);
  });

  it('skips async periods', () => {
    const asyncSlot = {
      days: 'M',
      start: '12:00',
      end: '12:00',
      isAsync: true,
    };
    expect(defaultGap(pick('A', MON_9), pick('A', asyncSlot))).toBe(0);
  });

  it('places an F section in both A and B', () => {
    const fall = pick('F', MON_9);
    expect(defaultGap(fall, pick('A', MON_11))).toBe(70);
    expect(defaultGap(fall, pick('B', MON_11))).toBe(70);
    expect(defaultGap(fall, pick('C', MON_11))).toBe(0);
  });

  it('places an S section in both C and D', () => {
    const spring = pick('S', MON_9);
    expect(defaultGap(spring, pick('C', MON_11))).toBe(70);
    expect(defaultGap(spring, pick('D', MON_11))).toBe(70);
    expect(defaultGap(spring, pick('A', MON_11))).toBe(0);
  });

  it('counts an F section against an A one once per shared quarter', () => {
    // A 70 minute gap in A and in B, not a doubled one.
    expect(
      defaultGap(pick('F', MON_9), pick('A', MON_11), pick('B', MON_11)),
    ).toBe(140);
  });
});

describe('ScheduleScorer criteria', () => {
  it('earlyClasses: minutes before the cutoff, per quarter-day', () => {
    const s = only({ earlyClasses: { importance: 'high', before: '10:00' } });
    // 9:00 is 60 early; a second class later the same day adds nothing.
    expect(s.groupCost([pick('A', MON_9), pick('A', MON_11)])).toBe(
      W.high * 60,
    );
    expect(s.groupCost([pick('A', MON_11)])).toBe(0);
    // An F section is early in both of its quarters.
    expect(s.groupCost([pick('F', MON_9)])).toBe(W.high * 120);
  });

  it('lateClasses: minutes past the cutoff, per quarter-day', () => {
    const s = only({ lateClasses: { importance: 'low', after: '14:30' } });
    expect(s.groupCost([pick('A', MON_14)])).toBe(W.low * 20);
    expect(s.groupCost([pick('A', MON_11)])).toBe(0);
  });

  it('gaps min: back-to-back classes are short', () => {
    const s = scorerWith({
      termBalance: { importance: 'off' },
      gaps: { importance: 'low', min: 15 },
    });
    const next = { days: 'M', start: '9:50', end: '10:40' };
    expect(s.groupCost([pick('A', MON_9), pick('A', next)])).toBe(W.low * 15);
    // max is raised to min (15), so a 70 minute gap is 55 over it.
    expect(s.groupCost([pick('A', MON_9), pick('A', MON_11)])).toBe(
      W.low * (70 - 15),
    );
  });

  it('gaps max: only idle time beyond it counts', () => {
    const s = scorerWith({
      termBalance: { importance: 'off' },
      gaps: { importance: 'medium', max: 60 },
    });
    expect(s.groupCost([pick('A', MON_9), pick('A', MON_11)])).toBe(
      W.medium * 10,
    );
    expect(s.groupCost([pick('A', MON_9), pick('A', MON_14)])).toBe(
      W.medium * (250 - 60),
    );
  });

  it('lunch: shortfall of the longest free stretch in the window', () => {
    const s = only({
      lunch: { importance: 'medium', from: '11:00', to: '14:00', minutes: 45 },
    });
    // 11:00-11:50 leaves 12:00-14:00 free: lunch is fine.
    expect(s.groupCost([pick('A', MON_11)])).toBe(0);
    // Classes 11:00-12:50 and 13:30-14:20 leave 40 minutes at most.
    const busy = [
      pick('A', { days: 'M', start: '11:00', end: '12:50' }),
      pick('A', { days: 'M', start: '13:30', end: '14:20' }),
    ];
    expect(s.groupCost(busy)).toBe(W.medium * 5);
    // A class covering the whole window leaves nothing.
    expect(
      s.groupCost([pick('A', { days: 'M', start: '10:00', end: '15:00' })]),
    ).toBe(W.medium * 45);
    // A day with no class is not charged.
    expect(s.groupCost([])).toBe(0);
  });

  // The settings offer free hours because classes keep to the hour: these
  // are what make the numbers behind those choices mean what they say.
  describe('on the hourly class grid', () => {
    const at = (hour: number) => ({
      days: 'M',
      start: `${hour}:00`,
      end: `${hour}:50`,
    });
    const backToBack = [pick('A', at(11)), pick('A', at(12))];
    const freeHour = [pick('A', at(11)), pick('A', at(13))];
    const twoFreeHours = [pick('A', at(11)), pick('A', at(14))];

    it('"at least 1 free hour" is met by a free hour, not back to back', () => {
      const s = only({ gaps: { importance: 'medium', min: 70 } });
      expect(s.groupCost(freeHour)).toBe(0);
      expect(s.groupCost(backToBack)).toBeGreaterThan(0);
    });

    it('"at most 1 free hour" allows one and charges a second', () => {
      const s = only({ gaps: { importance: 'medium', max: 70 } });
      expect(s.groupCost(backToBack)).toBe(0);
      expect(s.groupCost(freeHour)).toBe(0);
      expect(s.groupCost(twoFreeHours)).toBeGreaterThan(0);
    });

    it('a 1 hour lunch is met by a free hour, a 2 hour one by two', () => {
      const lunch = (minutes: number) =>
        only({
          lunch: { importance: 'medium', from: '11:00', to: '15:00', minutes },
        });
      const day = (...hours: number[]) => hours.map(h => pick('A', at(h)));
      expect(lunch(60).groupCost(day(11, 13, 14))).toBe(0);
      expect(lunch(60).groupCost(day(11, 12, 13, 14))).toBeGreaterThan(0);
      expect(lunch(120).groupCost(day(11, 14))).toBe(0);
      expect(lunch(120).groupCost(day(11, 13, 14))).toBeGreaterThan(0);
    });
  });

  it('fewerDays: 90 per quarter-day with a class', () => {
    const s = only({ fewerDays: { importance: 'low' } });
    const tue = { ...MON_9, days: 'T' };
    expect(s.groupCost([pick('A', MON_9), pick('A', MON_11)])).toBe(90);
    expect(s.groupCost([pick('A', MON_9), pick('A', tue)])).toBe(180);
    expect(s.groupCost([pick('F', MON_9)])).toBe(180);
  });

  it('freeDays: 120 per quarter-day on a listed day', () => {
    const s = only({ freeDays: { importance: 'low', days: ['F'] } });
    const fri = { ...MON_9, days: 'F' };
    expect(s.groupCost([pick('A', MON_9)])).toBe(0);
    expect(
      s.groupCost([pick('A', fri), pick('A', { ...fri, start: '13:00' })]),
    ).toBe(120);
    expect(s.groupCost([pick('S', fri)])).toBe(240);
  });

  it('termBalance: 200 per course away from three in a quarter', () => {
    const s = scorerWith();
    expect(s.termBalanceCost(['A', 'A', 'A', 'B', 'B', 'B'])).toBe(0);
    expect(s.termBalanceCost(['A'])).toBe(W.high * 200 * 2);
    // An F course is one in A and one in B.
    expect(s.termBalanceCost(['F'])).toBe(W.high * 200 * 4);
    expect(s.termBalanceCost(['S', 'S', 'S'])).toBe(0);
    expect(s.termBalanceCost(['A', 'A', 'A', 'A'])).toBe(W.high * 200);
    expect(
      scorerWith({ termBalance: { importance: 'off' } }).termBalanceCost(['A']),
    ).toBe(0);
  });

  it('openSeats: capped full, closed and waitlisted sections count', () => {
    const s = only({ openSeats: { importance: 'low' } });
    const full = { seatsAvailable: 0 };
    expect(s.groupCost([pick('A', MON_9)])).toBe(0);
    expect(s.groupCost([pick('A', MON_9, full)])).toBe(120);
    expect(s.groupCost([pick('A', MON_9, { status: 'Closed' })])).toBe(120);
    expect(s.groupCost([pick('A', MON_9, { status: 'Waitlist' })])).toBe(120);
  });

  it('openSeats: on high by default', () => {
    expect(
      scorerWith().groupCost([pick('A', MON_9, { seatsAvailable: 0 })]),
    ).toBe(1080);
  });

  it('openSeats: an uncapped section is not full', () => {
    const s = only({ openSeats: { importance: 'low' } });
    expect(
      s.groupCost([pick('A', MON_9, { seats: 999, seatsAvailable: 0 })]),
    ).toBe(0);
  });

  it('openSeats: every full component counts', () => {
    const s = only({ openSeats: { importance: 'low' } });
    const full = { seatsAvailable: 0 };
    const selection: ScoredSelection = {
      combination: {
        lecture: section('A', [MON_9], full),
        lab: section('A', [MON_11], full),
      },
      term: 'A',
    };
    expect(s.groupCost([selection])).toBe(240);
  });

  it('instructorRating: 40 per point below five, 3.5 when unknown', () => {
    const s = only({ instructorRating: { importance: 'low' } });
    expect(s.groupCost([pick('A', MON_9, {}, 5)])).toBe(0);
    expect(s.groupCost([pick('A', MON_9, {}, 4)])).toBe(40);
    expect(s.groupCost([pick('A', MON_9, {}, null)])).toBe(60);
    expect(s.groupCost([pick('A', MON_9)])).toBe(60);
  });

  it('costs nothing for criteria that are off', () => {
    const s = scorerWith({
      gaps: { importance: 'off' },
      termBalance: { importance: 'off' },
    });
    expect(s.groupCost([pick('A', MON_9), pick('A', MON_14)])).toBe(0);
  });
});
