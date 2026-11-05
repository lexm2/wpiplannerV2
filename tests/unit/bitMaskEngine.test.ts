/**
 * Characterization tests for the bitmask conflict engine. Assert current
 * behaviour.
 */
import { describe, it, expect } from 'vitest';
import {
  sectionToMask,
  masksConflict,
  weeklySlotToMask,
  BitMaskEngine,
  buildConflictMatrix,
} from '../../src/core/scheduling/BitMaskEngine';
import {
  DayOfWeek,
  PeriodType,
  type Section,
  type Period,
} from '../../src/types/types';
import { AcademicTerm } from '../../src/types/schedule';

function period(
  days: DayOfWeek[],
  startH: number,
  startM: number,
  endH: number,
  endM: number,
): Period {
  return {
    type: PeriodType.LECTURE,
    instructors: ['Prof X'],
    startTime: { hours: startH, minutes: startM },
    endTime: { hours: endH, minutes: endM },
    location: 'SH',
    building: 'SH',
    room: '101',
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 0,
    days: new Set(days),
  } as Period;
}

function section(
  crn: number,
  periods: Period[],
  term = AcademicTerm.A,
): Section {
  return {
    crn,
    number: 'A01',
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

const MON_9_10 = () => section(1, [period([DayOfWeek.MONDAY], 9, 0, 10, 0)]);
const MON_930_1030 = () =>
  section(2, [period([DayOfWeek.MONDAY], 9, 30, 10, 30)]);
const mon9 = () => period([DayOfWeek.MONDAY], 9, 0, 10, 0);
const TUE_9_10 = () => section(3, [period([DayOfWeek.TUESDAY], 9, 0, 10, 0)]);
const MON_10_11 = () => section(4, [period([DayOfWeek.MONDAY], 10, 0, 11, 0)]);

describe('sectionToMask', () => {
  it('produces a non-zero mask for a section with real periods', () => {
    expect(sectionToMask(MON_9_10())).not.toBe(0n);
  });

  it('returns an empty mask when there are no periods', () => {
    expect(sectionToMask(section(9, []))).toBe(0n);
  });

  it('returns an empty mask for a period with no days', () => {
    expect(sectionToMask(section(9, [period([], 9, 0, 10, 0)]))).toBe(0n);
  });

  it('ignores a period whose end is not after its start', () => {
    expect(
      sectionToMask(section(9, [period([DayOfWeek.MONDAY], 10, 0, 10, 0)])),
    ).toBe(0n);
    expect(
      sectionToMask(section(9, [period([DayOfWeek.MONDAY], 11, 0, 10, 0)])),
    ).toBe(0n);
  });

  it('covers the whole day, so early and late classes still conflict', () => {
    // The catalog runs from 6:00 AM to 8:50 PM; a mask that drops either end
    // would let two clashing sections through as compatible.
    const early = (crn: number, startM: number) =>
      sectionToMask(
        section(crn, [period([DayOfWeek.MONDAY], 6, startM, 6, startM + 50)]),
      );
    expect(early(9, 0)).not.toBe(0n);
    expect(masksConflict(early(9, 0), early(10, 5))).toBe(true);

    const late = sectionToMask(
      section(11, [period([DayOfWeek.MONDAY], 20, 0, 23, 55)]),
    );
    const lateOverlap = sectionToMask(
      section(12, [period([DayOfWeek.MONDAY], 21, 0, 22, 0)]),
    );
    expect(masksConflict(late, lateOverlap)).toBe(true);
    expect(
      masksConflict(
        weeklySlotToMask({
          day: DayOfWeek.MONDAY,
          startTime: { hours: 0, minutes: 0 },
          endTime: { hours: 24, minutes: 0 },
        } as never),
        early(9, 0),
      ),
    ).toBe(true);
  });

  it('sets distinct bits per weekday, so same time on different days cannot collide', () => {
    expect(
      masksConflict(sectionToMask(MON_9_10()), sectionToMask(TUE_9_10())),
    ).toBe(false);
  });

  it('treats a multi-day period as occupying each of its days', () => {
    const mwf = sectionToMask(
      section(9, [
        period(
          [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY],
          9,
          0,
          10,
          0,
        ),
      ]),
    );
    expect(masksConflict(mwf, sectionToMask(MON_9_10()))).toBe(true);
    expect(masksConflict(mwf, sectionToMask(TUE_9_10()))).toBe(false);
  });
});

describe('masksConflict', () => {
  it('detects overlapping times on the same day', () => {
    expect(
      masksConflict(sectionToMask(MON_9_10()), sectionToMask(MON_930_1030())),
    ).toBe(true);
  });

  it('treats back-to-back times as non-conflicting (end slot is exclusive)', () => {
    expect(
      masksConflict(sectionToMask(MON_9_10()), sectionToMask(MON_10_11())),
    ).toBe(false);
  });

  it('never reports a conflict against an empty mask', () => {
    expect(masksConflict(sectionToMask(MON_9_10()), 0n)).toBe(false);
  });
});

describe('weeklySlotToMask', () => {
  it('agrees with sectionToMask for the same day and time', () => {
    const slotMask = weeklySlotToMask({
      day: DayOfWeek.MONDAY,
      startTime: { hours: 9, minutes: 0 },
      endTime: { hours: 10, minutes: 0 },
    } as never);
    expect(masksConflict(slotMask, sectionToMask(MON_9_10()))).toBe(true);
    expect(masksConflict(slotMask, sectionToMask(TUE_9_10()))).toBe(false);
  });

  it('blocks a class that starts before an off-grid end', () => {
    const slotMask = weeklySlotToMask({
      day: DayOfWeek.MONDAY,
      startTime: { hours: 9, minutes: 0 },
      endTime: { hours: 10, minutes: 3 },
    } as never);
    expect(masksConflict(slotMask, sectionToMask(MON_10_11()))).toBe(true);
  });
});

describe('BitMaskEngine', () => {
  it('caches per section, so getMask returns the same object across calls', () => {
    const engine = new BitMaskEngine();
    const s = MON_9_10();
    const first = engine.getMask(s);
    expect(engine.getMask(s)).toBe(first);
    expect(engine.addSection(s)).toBe(first);
  });

  it('does not reuse a mask for a different section with the same CRN', () => {
    // CRNs repeat across academic years, and a catalog refresh rebuilds
    // every Section, so the cache must not key on the CRN.
    const engine = new BitMaskEngine();
    const old = section(7, [period([DayOfWeek.MONDAY], 9, 0, 10, 0)]);
    const fresh = section(7, [period([DayOfWeek.TUESDAY], 9, 0, 10, 0)]);
    engine.getMask(old);
    expect(engine.getMask(fresh).mask).toBe(sectionToMask(fresh));
    expect(engine.getMask(fresh).section).toBe(fresh);
  });

  it('reports conflicts between overlapping sections and not between disjoint ones', () => {
    const engine = new BitMaskEngine();
    expect(engine.sectionsConflict(MON_9_10(), MON_930_1030())).toBe(true);
    expect(engine.sectionsConflict(MON_9_10(), TUE_9_10())).toBe(false);
    expect(engine.sectionsConflict(MON_9_10(), MON_10_11())).toBe(false);
  });

  it('does not conflict identical times in disjoint terms', () => {
    const engine = new BitMaskEngine();
    const a = section(10, [mon9()], AcademicTerm.A);
    const b = section(11, [mon9()], AcademicTerm.B);
    const c = section(12, [mon9()], AcademicTerm.C);
    expect(engine.sectionsConflict(a, b)).toBe(false);
    expect(engine.sectionsConflict(a, c)).toBe(false);
  });

  it('conflicts a semester section with the quarters it spans', () => {
    const engine = new BitMaskEngine();
    const f = section(13, [mon9()], AcademicTerm.F);
    const s = section(14, [mon9()], AcademicTerm.S);
    for (const [term, hitsF, hitsS] of [
      [AcademicTerm.A, true, false],
      [AcademicTerm.B, true, false],
      [AcademicTerm.C, false, true],
      [AcademicTerm.D, false, true],
    ] as const) {
      const q = section(20, [mon9()], term);
      expect(engine.sectionsConflict(q, f)).toBe(hitsF);
      expect(engine.sectionsConflict(q, s)).toBe(hitsS);
    }
    expect(engine.sectionsConflict(f, s)).toBe(false);
  });

  it('lets sections with disjoint date ranges share a time', () => {
    const engine = new BitMaskEngine();
    const early = section(15, [mon9()], AcademicTerm.A);
    const late = section(16, [mon9()], AcademicTerm.A);
    early.startDate = '2026-08-26';
    early.endDate = '2026-09-30';
    late.startDate = '2026-10-01';
    late.endDate = '2026-10-16';
    expect(engine.sectionsConflict(early, late)).toBe(false);
    late.startDate = '2026-09-30';
    // Cached masks are keyed by section, dates are read on every check.
    expect(engine.sectionsConflict(early, late)).toBe(true);
  });
});

describe('buildConflictMatrix', () => {
  it('builds a symmetric adjacency map keyed by CRN', () => {
    const engine = new BitMaskEngine();
    const sections = [MON_9_10(), MON_930_1030(), TUE_9_10()];
    const matrix = buildConflictMatrix(sections, engine);

    expect([...matrix.keys()].sort()).toEqual([1, 2, 3]);
    expect([...matrix.get(1)!]).toEqual([2]);
    expect([...matrix.get(2)!]).toEqual([1]);
    expect([...matrix.get(3)!]).toEqual([]);
  });

  it('returns an entry for every section even with no conflicts', () => {
    const engine = new BitMaskEngine();
    const matrix = buildConflictMatrix([MON_9_10(), TUE_9_10()], engine);
    expect(matrix.size).toBe(2);
    expect(matrix.get(1)!.size).toBe(0);
  });

  it('handles an empty input', () => {
    expect(buildConflictMatrix([], new BitMaskEngine()).size).toBe(0);
  });
});
