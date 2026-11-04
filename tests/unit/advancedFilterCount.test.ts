/**
 * countAdvancedFilters: the "N active" badge on a collapsed "More filters"
 * counts only the hidden filters that differ from their defaults.
 */
import { describe, it, expect } from 'vitest';
import { countAdvancedFilters } from '../../src/services/filtering/advancedFilterCount';
import type { ActiveFilter } from '../../src/types/filters';
import type { WeeklyTimeSlot } from '../../src/types/schedule';

const slot = (id: string) => ({ id }) as WeeklyTimeSlot;
const f = (
  id: string,
  criteria: unknown,
): Pick<ActiveFilter, 'id' | 'criteria'> => ({ id, criteria });

describe('countAdvancedFilters', () => {
  it('is zero with no filters and no schedule year', () => {
    expect(countAdvancedFilters([], undefined)).toBe(0);
  });

  it('counts "All" years when the schedule has a year', () => {
    expect(countAdvancedFilters([], 2025)).toBe(1);
  });

  it('does not count the academic year when it matches the schedule', () => {
    const filters = [f('academicYear', { year: 2025 })];
    expect(countAdvancedFilters(filters, 2025)).toBe(0);
    expect(countAdvancedFilters(filters, 2024)).toBe(1);
    expect(countAdvancedFilters(filters, undefined)).toBe(1);
  });

  it('ignores the essentials shown outside the section', () => {
    const filters = [
      f('term', { terms: ['A'] }),
      f('graduateLevel', { level: 'graduate' }),
      f('bookmark', { showBookmarkedOnly: true }),
      f('availability', { availableOnly: true }),
      f('periodConflict', { avoidConflicts: true, blockedSlots: [] }),
    ];
    expect(countAdvancedFilters(filters, undefined)).toBe(0);
  });

  it('counts each advanced filter once', () => {
    const filters = [
      f('department', { departments: ['CS'] }),
      f('times', { slots: [] }),
      f('creditRange', { min: 1, max: 3 }),
      f('rmpRating', { minRating: 4 }),
    ];
    expect(countAdvancedFilters(filters, undefined)).toBe(4);
  });

  it('counts minimum seats but not available-only', () => {
    expect(
      countAdvancedFilters(
        [f('availability', { availableOnly: true, minAvailable: 5 })],
        undefined,
      ),
    ).toBe(1);
  });

  it('counts calendar slots and the exact-term overlap separately', () => {
    const calendar = f('periodConflict', {
      avoidConflicts: false,
      blockedSlots: [slot('local-1')],
    });
    expect(countAdvancedFilters([calendar], undefined)).toBe(1);
    const both = f('periodConflict', {
      avoidConflicts: false,
      blockedSlots: [slot('local-1')],
      semesterSpansQuarters: false,
    });
    expect(countAdvancedFilters([both], undefined)).toBe(2);
    const manualSlot = f('periodConflict', {
      avoidConflicts: true,
      blockedSlots: [slot('manual')],
      semesterSpansQuarters: true,
    });
    expect(countAdvancedFilters([manualSlot], undefined)).toBe(0);
  });
});
