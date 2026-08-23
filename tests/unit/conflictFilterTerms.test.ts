/**
 * ConflictFilter's term expansion into blocked bitmasks: F -> [A,B],
 * S -> [C,D], ALL -> [A,B,C,D].
 */
import { describe, it, expect } from 'vitest';
import { ConflictFilter } from '../../src/core/filtering/filters/ConflictFilter';
import { weeklySlotToMask } from '../../src/core/scheduling/BitMaskEngine';
import { DayOfWeek } from '../../src/types/types';
import { AcademicTerm, type WeeklyTimeSlot } from '../../src/types/schedule';

function slot(term: AcademicTerm, day = DayOfWeek.MONDAY): WeeklyTimeSlot {
  return {
    id: `9999-${term}-${day}`,
    day,
    startTime: { hours: 9, minutes: 0 },
    endTime: { hours: 10, minutes: 0 },
    term,
  };
}

function masksFor(...slots: WeeklyTimeSlot[]): Map<string, bigint> {
  return new ConflictFilter().getBlockedMasksByTerm({
    avoidConflicts: true,
    blockedSlots: slots,
  });
}

describe('ConflictFilter term expansion', () => {
  it('maps a single-term slot to just that term', () => {
    const masks = masksFor(slot(AcademicTerm.A));
    expect([...masks.keys()]).toEqual(['A']);
  });

  it('expands F (fall) across A and B', () => {
    const masks = masksFor(slot(AcademicTerm.F));
    expect([...masks.keys()].sort()).toEqual(['A', 'B']);
  });

  it('expands S (spring) across C and D', () => {
    const masks = masksFor(slot(AcademicTerm.S));
    expect([...masks.keys()].sort()).toEqual(['C', 'D']);
  });

  it('expands ALL across all four quarter terms', () => {
    const masks = masksFor(slot(AcademicTerm.ALL));
    expect([...masks.keys()].sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('ORs together multiple slots landing in the same term', () => {
    const mon = slot(AcademicTerm.A, DayOfWeek.MONDAY);
    const tue = slot(AcademicTerm.A, DayOfWeek.TUESDAY);
    const combined = masksFor(mon, tue).get('A')!;

    expect(combined).toBe(weeklySlotToMask(mon) | weeklySlotToMask(tue));
    // and it really covers both days, not just one
    expect(combined & weeklySlotToMask(mon)).not.toBe(0n);
    expect(combined & weeklySlotToMask(tue)).not.toBe(0n);
  });

  it('overlaps F and A onto the same A-term mask', () => {
    const masks = masksFor(slot(AcademicTerm.F), slot(AcademicTerm.A));
    expect(masks.get('A')).toBe(weeklySlotToMask(slot(AcademicTerm.A)));
    expect(masks.get('B')).not.toBe(undefined);
  });

  it('skips slots that produce an empty mask (outside the 07:00-22:00 grid)', () => {
    const outside: WeeklyTimeSlot = {
      id: '1-A-M',
      day: DayOfWeek.MONDAY,
      startTime: { hours: 5, minutes: 0 },
      endTime: { hours: 6, minutes: 0 },
      term: AcademicTerm.A,
    };
    expect(masksFor(outside).size).toBe(0);
  });

  it('returns an empty map for no blocked slots', () => {
    expect(masksFor().size).toBe(0);
  });

  it('returns a copy, so mutating the result does not corrupt the filter', () => {
    const filter = new ConflictFilter();
    const criteria = {
      avoidConflicts: true,
      blockedSlots: [slot(AcademicTerm.A)],
    };
    const first = filter.getBlockedMasksByTerm(criteria);
    first.set('A', 0n);
    expect(filter.getBlockedMasksByTerm(criteria).get('A')).not.toBe(0n);
  });
});
