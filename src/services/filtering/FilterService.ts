import { Course } from '../../types/types';
import {
  ActiveFilter,
  BookmarkFilterCriteria,
  SearchTextFilterCriteria,
} from '../../types/filters';
import { FilterState } from '../../core/filtering/FilterState';
import { rankCoursesByRelevance } from '../../utils/searchUtils';
import {
  SectionFilterPipeline,
  SectionBasedFilter,
} from '../../core/filtering/SectionFilterPipeline';
import { ConflictFilter } from '../../core/filtering/filters/ConflictFilter';
import { FilterableSection } from '../../types/filterableUnit';
import { getAllSections } from '../../utils/courseUtils';
import type { FilterOption } from '../../types/common';
import { logger } from '../../utils/logger';

export class FilterService {
  private filterState: FilterState;
  private registeredFilters: Map<string, SectionBasedFilter> = new Map();
  private sectionPipeline: SectionFilterPipeline;
  private getBookmarkedCourseIds: (() => string[]) | null;

  constructor(config?: { getBookmarkedCourseIds?: () => string[] }) {
    this.filterState = new FilterState();
    this.sectionPipeline = new SectionFilterPipeline();
    this.getBookmarkedCourseIds = config?.getBookmarkedCourseIds ?? null;
  }

  registerFilter(filter: SectionBasedFilter): void {
    this.registeredFilters.set(filter.id, filter);
    this.sectionPipeline.registerFilter(filter);
  }

  unregisterFilter(filterId: string): boolean {
    const removed = this.registeredFilters.delete(filterId);
    if (removed) {
      this.removeFilter(filterId);
      this.sectionPipeline.unregisterFilter(filterId);
    }
    return removed;
  }

  getRegisteredFilter(filterId: string): SectionBasedFilter | undefined {
    return this.registeredFilters.get(filterId);
  }

  getAvailableFilters(): SectionBasedFilter[] {
    return Array.from(this.registeredFilters.values());
  }

  setConflictDetector(): void {
    const conflictFilter = new ConflictFilter();
    this.registerFilter(conflictFilter);
  }

  addFilter(filterId: string, criteria: unknown): boolean {
    // Bookmark filter is course-level, handled outside the section pipeline
    if (filterId === 'bookmark') {
      const bookmarkCriteria = criteria as BookmarkFilterCriteria;
      const displayValue = bookmarkCriteria.showBookmarkedOnly
        ? 'Bookmarked Only'
        : 'All Courses';
      this.filterState.addFilter(filterId, 'Bookmarks', criteria, displayValue);
      return true;
    }

    const filter = this.registeredFilters.get(filterId);
    if (!filter) {
      logger.error(`Filter '${filterId}' is not registered`);
      return false;
    }

    if (!filter.isValidCriteria(criteria)) {
      logger.error(`Invalid criteria for filter '${filterId}'`);
      return false;
    }

    const displayValue = filter.getDisplayValue(criteria);
    this.filterState.addFilter(filterId, filter.name, criteria, displayValue);
    return true;
  }

  updateFilter(filterId: string, criteria: unknown): boolean {
    if (filterId === 'bookmark') {
      const bookmarkCriteria = criteria as BookmarkFilterCriteria;
      const displayValue = bookmarkCriteria.showBookmarkedOnly
        ? 'Bookmarked Only'
        : 'All Courses';
      return this.filterState.updateFilter(filterId, criteria, displayValue);
    }

    const filter = this.registeredFilters.get(filterId);
    if (!filter) {
      return false;
    }

    if (!filter.isValidCriteria(criteria)) {
      return false;
    }

    const displayValue = filter.getDisplayValue(criteria);
    return this.filterState.updateFilter(filterId, criteria, displayValue);
  }

  removeFilter(filterId: string): boolean {
    return this.filterState.removeFilter(filterId);
  }

  clearFilters(): void {
    this.filterState.clearFilters();
  }

  resetFilters(year?: number): void {
    this.filterState.clearFilters();
    if (year !== undefined) {
      this.addFilter('academicYear', { year });
    }
  }

  /** Check if filters are in "default" state (only the schedule's year filter, or empty) */
  hasNonDefaultFilters(scheduleYear?: number): boolean {
    const filters = this.getActiveFilters();
    if (filters.length === 0) return false;
    if (
      filters.length === 1 &&
      filters[0].id === 'academicYear' &&
      scheduleYear !== undefined
    ) {
      const criteria = filters[0].criteria as { year: number | 'all' };
      return criteria.year !== scheduleYear;
    }
    return true;
  }

  toggleFilter(filterId: string, criteria: unknown): boolean {
    if (this.hasFilter(filterId)) {
      return this.removeFilter(filterId);
    } else {
      return this.addFilter(filterId, criteria);
    }
  }

  hasFilter(filterId: string): boolean {
    return this.filterState.hasFilter(filterId);
  }

  getActiveFilters(): ActiveFilter[] {
    return this.filterState.getActiveFilters();
  }

  /**
   * Reactive, typed accessor for a single filter's criteria. Reads the
   * SvelteMap-backed FilterState, so it stays reactive inside
   * `$derived`/templates.
   */
  getCriteria<T>(filterId: string): T | undefined {
    return this.filterState.getFilter(filterId)?.criteria as T | undefined;
  }

  getFilterCount(): number {
    return this.filterState.getFilterCount();
  }

  isEmpty(): boolean {
    return this.filterState.isEmpty();
  }

  getFilterSummary(): string {
    const activeFilters = this.getActiveFilters();
    if (activeFilters.length === 0) {
      return 'No filters active';
    }

    if (activeFilters.length === 1) {
      return `1 filter: ${activeFilters[0].displayValue}`;
    }

    return `${activeFilters.length} filters active`;
  }

  apply(courses: Course[]): FilterableSection[] {
    if (this.isEmpty()) {
      return this.sectionPipeline.flattenCoursesToSections(courses);
    }

    const criteriaMap = this.getCriteriaMap();

    // Remove bookmark from criteriaMap - it's handled post-pipeline in filterCourses()
    criteriaMap.delete('bookmark');

    if (criteriaMap.size === 0) {
      return this.sectionPipeline.flattenCoursesToSections(courses);
    }

    const sections = this.sectionPipeline.flattenCoursesToSections(courses);
    return this.sectionPipeline.applyFilters(sections, criteriaMap);
  }

  resolveToCourses(sections: FilterableSection[]): Course[] {
    return this.sectionPipeline.reconstructCourses(sections);
  }

  filterCourses(courses: Course[]): Course[] {
    if (this.isEmpty()) {
      return courses;
    }

    const filteredSections = this.apply(courses);
    let filteredCourses = this.resolveToCourses(filteredSections);

    const criteriaMap = this.getCriteriaMap();
    const bookmarkCriteria = criteriaMap.get('bookmark') as
      BookmarkFilterCriteria | undefined;
    if (
      bookmarkCriteria &&
      bookmarkCriteria.showBookmarkedOnly &&
      this.getBookmarkedCourseIds
    ) {
      const bookmarkedIds = new Set(this.getBookmarkedCourseIds());
      filteredCourses = filteredCourses.filter(course =>
        bookmarkedIds.has(course.id),
      );
    }

    const searchCriteria = criteriaMap.get('searchText') as
      SearchTextFilterCriteria | undefined;
    if (searchCriteria && searchCriteria.query) {
      filteredCourses = rankCoursesByRelevance(
        filteredCourses,
        searchCriteria.query,
      );
    }

    return filteredCourses;
  }

  filterCoursesExcluding(courses: Course[], excludeIds: string[]): Course[] {
    const criteriaMap = this.getCriteriaMap();
    criteriaMap.delete('bookmark');
    for (const id of excludeIds) {
      criteriaMap.delete(id);
    }

    if (criteriaMap.size === 0) {
      return courses;
    }

    const sections = this.sectionPipeline.flattenCoursesToSections(courses);
    const filtered = this.sectionPipeline.applyFilters(sections, criteriaMap);
    return this.sectionPipeline.reconstructCourses(filtered);
  }

  getFilterOptions(
    filterId: string,
    courses: Course[],
  ): string[] | FilterOption[] | null {
    switch (filterId) {
      case 'department':
        return this.getDepartmentOptions(courses);
      case 'term':
        return this.getTermOptions(courses);
      default:
        return null;
    }
  }

  private getCriteriaMap(): Map<string, unknown> {
    const criteriaMap = new Map<string, unknown>();
    const activeFilters = this.getActiveFilters();
    for (const filter of activeFilters) {
      criteriaMap.set(filter.id, filter.criteria);
    }
    return criteriaMap;
  }

  private getDepartmentOptions(courses: Course[]): string[] {
    const departments = new Set<string>();
    courses.forEach(course => departments.add(course.departmentAbbr));
    return Array.from(departments).sort();
  }

  private getTermOptions(courses: Course[]): string[] {
    const terms = new Set<string>();
    courses.forEach(course => {
      const sections = getAllSections(course);
      sections.forEach(section => {
        if (section.computedTerm) {
          terms.add(section.computedTerm);
        }
      });
    });
    return Array.from(terms).sort();
  }
}
