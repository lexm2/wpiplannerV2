/**
 * Characterization tests for the bitmask conflict engine. Assert current
 * behaviour, quirks included (see the 07:00 boundary cases below).
 */
import { describe, it, expect } from 'vitest';
import {
    sectionToMask,
    masksConflict,
    weeklySlotToMask,
    BitMaskEngine,
    buildConflictMatrix,
} from '../../src/core/scheduling/BitMaskEngine';
import { DayOfWeek, PeriodType, type Section, type Period } from '../../src/types/types';
import { AcademicTerm } from '../../src/types/schedule';

function period(days: DayOfWeek[], startH: number, startM: number, endH: number, endM: number): Period {
    return {
        type: PeriodType.LECTURE,
        professor: 'Prof X',
        startTime: { hours: startH, minutes: startM },
        endTime: { hours: endH, minutes: endM },
        location: 'SH', building: 'SH', room: '101',
        seats: 30, seatsAvailable: 10, actualWaitlist: 0, maxWaitlist: 0,
        days: new Set(days),
    } as Period;
}

function section(crn: number, periods: Period[], term = AcademicTerm.A): Section {
    return {
        crn, number: 'A01', seats: 30, seatsAvailable: 10,
        actualWaitlist: 0, maxWaitlist: 0, computedTerm: term, periods,
    };
}

const MON_9_10 = () => section(1, [period([DayOfWeek.MONDAY], 9, 0, 10, 0)]);
const MON_930_1030 = () => section(2, [period([DayOfWeek.MONDAY], 9, 30, 10, 30)]);
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
        expect(sectionToMask(section(9, [period([DayOfWeek.MONDAY], 10, 0, 10, 0)]))).toBe(0n);
        expect(sectionToMask(section(9, [period([DayOfWeek.MONDAY], 11, 0, 10, 0)]))).toBe(0n);
    });

    it('ignores times outside the 07:00-22:00 window the grid models', () => {
        // Before the window: slot index goes negative and the period is skipped.
        expect(sectionToMask(section(9, [period([DayOfWeek.MONDAY], 6, 0, 6, 30)]))).toBe(0n);
        // Past the window end: end slot exceeds SLOTS_PER_DAY and is skipped.
        expect(sectionToMask(section(9, [period([DayOfWeek.MONDAY], 21, 0, 23, 0)]))).toBe(0n);
    });

    it('sets distinct bits per weekday, so same time on different days cannot collide', () => {
        expect(masksConflict(sectionToMask(MON_9_10()), sectionToMask(TUE_9_10()))).toBe(false);
    });

    it('treats a multi-day period as occupying each of its days', () => {
        const mwf = sectionToMask(section(9, [period([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY], 9, 0, 10, 0)]));
        expect(masksConflict(mwf, sectionToMask(MON_9_10()))).toBe(true);
        expect(masksConflict(mwf, sectionToMask(TUE_9_10()))).toBe(false);
    });
});

describe('masksConflict', () => {
    it('detects overlapping times on the same day', () => {
        expect(masksConflict(sectionToMask(MON_9_10()), sectionToMask(MON_930_1030()))).toBe(true);
    });

    it('treats back-to-back times as non-conflicting (end slot is exclusive)', () => {
        expect(masksConflict(sectionToMask(MON_9_10()), sectionToMask(MON_10_11()))).toBe(false);
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
});

describe('BitMaskEngine', () => {
    it('caches by CRN, so getMask returns the same object across calls', () => {
        const engine = new BitMaskEngine();
        const s = MON_9_10();
        const first = engine.getMask(s);
        expect(engine.getMask(s)).toBe(first);
        expect(engine.addSection(s)).toBe(first);
    });

    it('reports conflicts between overlapping sections and not between disjoint ones', () => {
        const engine = new BitMaskEngine();
        expect(engine.sectionsConflict(MON_9_10(), MON_930_1030())).toBe(true);
        expect(engine.sectionsConflict(MON_9_10(), TUE_9_10())).toBe(false);
        expect(engine.sectionsConflict(MON_9_10(), MON_10_11())).toBe(false);
    });

    it('segregates by exact term string, so identical times in different terms do not conflict', () => {
        const engine = new BitMaskEngine();
        const a = section(10, [period([DayOfWeek.MONDAY], 9, 0, 10, 0)], AcademicTerm.A);
        const b = section(11, [period([DayOfWeek.MONDAY], 9, 0, 10, 0)], AcademicTerm.B);
        expect(engine.sectionsConflict(a, b)).toBe(false);
    });

    it('compares terms by string equality, so an A section and an F section spanning A do not conflict', () => {
        // Documents a real limitation: F spans A+B and S spans C+D, but
        // sectionsConflict early-returns on `computedTerm` inequality, so the
        // overlap is invisible here. Term expansion is the caller's job
        // (see ConflictFilter.precomputeBlockedMasks).
        const engine = new BitMaskEngine();
        const a = section(12, [period([DayOfWeek.MONDAY], 9, 0, 10, 0)], AcademicTerm.A);
        const f = section(13, [period([DayOfWeek.MONDAY], 9, 0, 10, 0)], AcademicTerm.F);
        expect(engine.sectionsConflict(a, f)).toBe(false);
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
