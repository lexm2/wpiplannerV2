import type { ActiveFilter } from '../../types/filters';
import type { FilterService } from './FilterService';

/**
 * Filters that judge the course, not the section. They narrow the course list,
 * but a student choosing sections has already picked the course, so e.g. a search
 * or year left over from the Degree page must not block it.
 */
export const COURSE_FILTER_IDS = [
  'searchText',
  'department',
  'academicYear',
  'bookmark',
  'degreeBucket',
  'graduateLevel',
  'creditRange',
  'degreeAttribute',
  'courseLevel',
  'offeringPattern',
];

/** The active filters that can change which of a course's sections are listed. */
export function sectionFilters<T extends Pick<ActiveFilter, 'id'>>(
  filters: readonly T[],
): T[] {
  return filters.filter(f => !COURSE_FILTER_IDS.includes(f.id));
}

/** Clears what the section picker offers, and leaves the course list's filters. */
export function clearSectionFilters(filterService: FilterService): void {
  for (const { id } of sectionFilters(filterService.getActiveFilters())) {
    filterService.removeFilter(id);
  }
}
