import type {
  ActiveFilter,
  AcademicYearFilterCriteria,
  AvailabilityFilterCriteria,
  ConflictCriteria,
} from '../../types/filters';
import { isCalendarSlot } from '../scheduling/calendarEventProvider';

/**
 * How many of the filters tucked into "More filters" differ from their
 * defaults, so a collapsed section still says something is narrowing the
 * results. "Default" matches FilterService.hasNonDefaultFilters: the academic
 * year is only active when it differs from the schedule's own year, so "All"
 * counts when the schedule has one.
 */
export function countAdvancedFilters(
  filters: readonly Pick<ActiveFilter, 'id' | 'criteria'>[],
  scheduleYear: number | undefined,
): number {
  const criteriaOf = <T>(id: string) =>
    filters.find(f => f.id === id)?.criteria as T | undefined;

  let count = 0;

  const year =
    criteriaOf<AcademicYearFilterCriteria>('academicYear')?.year ?? 'all';
  if (year !== (scheduleYear ?? 'all')) count++;

  for (const id of ['department', 'times', 'creditRange', 'rmpRating'])
    if (criteriaOf(id) !== undefined) count++;

  if (criteriaOf<AvailabilityFilterCriteria>('availability')?.minAvailable)
    count++;

  const conflict = criteriaOf<ConflictCriteria>('periodConflict');
  if (conflict?.blockedSlots.some(isCalendarSlot)) count++;
  if (conflict?.semesterSpansQuarters === false) count++;

  return count;
}
