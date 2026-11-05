import { Course } from '../../types/types';
import {
  ActiveFilter,
  BookmarkFilterCriteria,
  SearchTextFilterCriteria,
} from '../../types/filters';
import { FilterState } from '../../core/filtering/FilterState';
import {
  SectionFilterPipeline,
  SectionBasedFilter,
  acceptsCriteria,
} from '../../core/filtering/SectionFilterPipeline';
import { SearchTextFilter } from '../../core/filtering/filters/SearchTextFilter';
import { FilterableSection } from '../../types/filterableUnit';
import { getAllSections } from '../../utils/courseUtils';
import type { FilterOption } from '../../types/common';
import { logger } from '../../utils/logger';
import { countActiveFilters } from './advancedFilterCount';

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

    if (!acceptsCriteria(filter, criteria)) {
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

    if (!acceptsCriteria(filter, criteria)) {
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

  /** Whether the student has set any filter beyond the default academic year. */
  hasNonDefaultFilters(scheduleYear: number | undefined): boolean {
    return this.getFilterCount(scheduleYear) > 0;
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

  /** Filters the student set; the default academic year is not counted. */
  getFilterCount(scheduleYear: number | undefined): number {
    return countActiveFilters(this.getActiveFilters(), scheduleYear);
  }

  isEmpty(): boolean {
    return this.filterState.isEmpty();
  }

  apply(courses: Course[]): FilterableSection[] {
    if (this.isEmpty()) {
      return this.sectionPipeline.flattenCoursesToSections(courses);
    }

    const criteriaMap = this.getCriteriaMap();

    // Remove bookmark from criteriaMap - it's handled post-pipeline in filterCourses()
    criteriaMap.delete('bookmark');

    const sections = this.sectionPipeline.flattenCoursesToSections(courses);
    if (criteriaMap.size === 0) {
      return sections;
    }
    return this.sectionPipeline.applyFilters(sections, criteriaMap);
  }

  resolveToCourses(sections: FilterableSection[]): Course[] {
    return this.sectionPipeline.reconstructCourses(sections);
  }

  filterCourses(courses: Course[]): Course[] {
    if (this.isEmpty()) {
      return courses;
    }

    const criteriaMap = this.getCriteriaMap();
    const bookmarkCriteria = criteriaMap.get('bookmark') as
      BookmarkFilterCriteria | undefined;
    const searchCriteria = criteriaMap.get('searchText') as
      SearchTextFilterCriteria | undefined;
    criteriaMap.delete('bookmark');

    // With no section filters, flattening and rebuilding would only copy each
    // course and drop those without sections, so do just the latter.
    let filteredCourses: Course[];
    if (criteriaMap.size === 0) {
      filteredCourses = courses.filter(
        c => !!c.lectures?.length || !!c.standaloneLabs?.length,
      );
    } else {
      const sections = this.sectionPipeline.flattenCoursesToSections(courses);
      filteredCourses = this.resolveToCourses(
        this.sectionPipeline.applyFilters(sections, criteriaMap),
      );
    }

    filteredCourses = this.keepBookmarked(filteredCourses, bookmarkCriteria);

    // A search criterion was only accepted through the registered
    // SearchTextFilter, which ranks by the index it matched with.
    const searchFilter = this.registeredFilters.get('searchText');
    if (searchCriteria?.query && searchFilter instanceof SearchTextFilter) {
      filteredCourses = searchFilter.rank(
        filteredCourses,
        searchCriteria.query,
      );
    }

    return filteredCourses;
  }

  /** Like filterCourses(), but skipping the given filters (and not ranking). */
  filterCoursesExcluding(courses: Course[], excludeIds: string[]): Course[] {
    const criteriaMap = this.getCriteriaMap();
    const bookmarkCriteria = criteriaMap.get('bookmark') as
      BookmarkFilterCriteria | undefined;
    criteriaMap.delete('bookmark');
    for (const id of excludeIds) {
      criteriaMap.delete(id);
    }

    let filtered = courses;
    if (criteriaMap.size > 0) {
      const sections = this.sectionPipeline.flattenCoursesToSections(courses);
      filtered = this.sectionPipeline.reconstructCourses(
        this.sectionPipeline.applyFilters(sections, criteriaMap),
      );
    }
    return excludeIds.includes('bookmark')
      ? filtered
      : this.keepBookmarked(filtered, bookmarkCriteria);
  }

  // The bookmark filter is course-level, so it runs after the section pipeline.
  private keepBookmarked(
    courses: Course[],
    criteria: BookmarkFilterCriteria | undefined,
  ): Course[] {
    if (!criteria?.showBookmarkedOnly || !this.getBookmarkedCourseIds) {
      return courses;
    }
    const bookmarkedIds = new Set(this.getBookmarkedCourseIds());
    return courses.filter(course => bookmarkedIds.has(course.id));
  }

  /** Like apply(), but skipping the given section filters. */
  applyExcluding(courses: Course[], excludeIds: string[]): FilterableSection[] {
    const criteriaMap = this.getCriteriaMap();
    criteriaMap.delete('bookmark');
    for (const id of excludeIds) {
      criteriaMap.delete(id);
    }

    const sections = this.sectionPipeline.flattenCoursesToSections(courses);
    if (criteriaMap.size === 0) return sections;
    return this.sectionPipeline.applyFilters(sections, criteriaMap);
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
