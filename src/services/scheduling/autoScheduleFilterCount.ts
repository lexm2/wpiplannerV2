import type { ActiveFilter, ConflictCriteria } from '../../types/filters';
import { NON_SECTION_FILTER_IDS } from './AutoScheduler';

/**
 * How many settings in Auto-Schedule's Filters section narrow what it will
 * schedule, so the folded section still says so. Filters the scheduler
 * ignores are not counted (and are not offered there); of the conflict
 * filter only its avoid-times blocks count, and opting out of "keep classes
 * clear of my calendar events" counts because it widens the search onto the
 * student's own commitments.
 */
export function countAutoScheduleFilters(
  filters: readonly Pick<ActiveFilter, 'id' | 'criteria'>[],
  avoidCalendarEvents: boolean | undefined,
): number {
  let count = 0;
  for (const f of filters) {
    if (f.id === 'periodConflict') {
      const slots = (f.criteria as ConflictCriteria).blockedSlots;
      if (slots && slots.length > 0) count++;
    } else if (!NON_SECTION_FILTER_IDS.includes(f.id)) {
      count++;
    }
  }
  if (avoidCalendarEvents === false) count++;
  return count;
}
