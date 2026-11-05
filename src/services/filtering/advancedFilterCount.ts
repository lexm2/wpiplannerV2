import type {
  ActiveFilter,
  AcademicYearFilterCriteria,
  AvailabilityFilterCriteria,
  ConflictCriteria,
} from '../../types/filters';

type Filters = readonly Pick<ActiveFilter, 'id' | 'criteria'>[];

/**
 * Whether the academic year differs from the one the student starts with, the
 * schedule's own. The year filter is always present, so only a change counts
 * as the student filtering: "All" counts when the schedule has a year.
 */
export function isAcademicYearChanged(
  filters: Filters,
  scheduleYear: number | undefined,
): boolean {
  const year =
    (
      filters.find(f => f.id === 'academicYear')?.criteria as
        AcademicYearFilterCriteria | undefined
    )?.year ?? 'all';
  return year !== (scheduleYear ?? 'all');
}

/**
 * How many filters the student has set, for "N filters active" labels and
 * the filter button's highlight. The default academic year is not one.
 */
export function countActiveFilters(
  filters: Filters,
  scheduleYear: number | undefined,
): number {
  const others = filters.filter(f => f.id !== 'academicYear').length;
  return others + (isAcademicYearChanged(filters, scheduleYear) ? 1 : 0);
}

/**
 * How many of the filters tucked into "More filters" differ from their
 * defaults, so a collapsed section still says something is narrowing the
 * results.
 */
export function countAdvancedFilters(
  filters: Filters,
  scheduleYear: number | undefined,
): number {
  const criteriaOf = <T>(id: string) =>
    filters.find(f => f.id === id)?.criteria as T | undefined;

  let count = isAcademicYearChanged(filters, scheduleYear) ? 1 : 0;

  for (const id of ['department', 'times', 'creditRange', 'rmpRating'])
    if (criteriaOf(id) !== undefined) count++;

  if (criteriaOf<AvailabilityFilterCriteria>('availability')?.minAvailable)
    count++;

  const conflict = criteriaOf<ConflictCriteria>('periodConflict');
  if (conflict?.avoidCalendarEvents) count++;
  if (conflict?.semesterSpansQuarters === false) count++;

  return count;
}
