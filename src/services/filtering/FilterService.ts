import { Course } from '../../types/types';
import { FilterEventListener, ActiveFilter, BookmarkFilterCriteria } from '../../types/filters';
import { FilterState } from '../../core/filtering/FilterState';
import { rankCoursesByRelevance, getAvailableProfessors } from '../../utils/searchUtils';
import { SectionFilterPipeline, SectionBasedFilter } from '../../core/filtering/SectionFilterPipeline';
import { ConflictFilter } from '../../core/filtering/filters/ConflictFilter';
import { FilterableSection } from '../../types/filterableUnit';
import { getAllSections } from '../../utils/courseUtils';

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

    // Filter Registration
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

    // Filter State Management
    addFilter(filterId: string, criteria: any): boolean {
        // Handle bookmark filter specially (course-level, not in pipeline)
        if (filterId === 'bookmark') {
            const displayValue = criteria.showBookmarkedOnly ? 'Bookmarked Only' : 'All Courses';
            this.filterState.addFilter(filterId, 'Bookmarks', criteria, displayValue);
            return true;
        }

        const filter = this.registeredFilters.get(filterId);
        if (!filter) {
            console.error(`Filter '${filterId}' is not registered`);
            return false;
        }

        if (!filter.isValidCriteria(criteria)) {
            console.error(`Invalid criteria for filter '${filterId}'`);
            return false;
        }

        const displayValue = filter.getDisplayValue(criteria);
        this.filterState.addFilter(filterId, filter.name, criteria, displayValue);
        return true;
    }

    updateFilter(filterId: string, criteria: any): boolean {
        if (filterId === 'bookmark') {
            const displayValue = criteria.showBookmarkedOnly ? 'Bookmarked Only' : 'All Courses';
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

    toggleFilter(filterId: string, criteria: any): boolean {
        if (this.hasFilter(filterId)) {
            return this.removeFilter(filterId);
        } else {
            return this.addFilter(filterId, criteria);
        }
    }

    // Filter State Queries
    hasFilter(filterId: string): boolean {
        return this.filterState.hasFilter(filterId);
    }

    getActiveFilters(): ActiveFilter[] {
        return this.filterState.getActiveFilters();
    }

    getFilterCount(): number {
        return this.filterState.getFilterCount();
    }

    isEmpty(): boolean {
        return this.filterState.isEmpty();
    }

    // Event Handling
    addEventListener(listener: FilterEventListener): void {
        this.filterState.addEventListener(listener);
    }

    removeEventListener(listener: FilterEventListener): void {
        this.filterState.removeEventListener(listener);
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

    // Primary filtering — returns FilterableSection[]
    apply(courses: Course[]): FilterableSection[] {
        if (this.isEmpty()) {
            return this.sectionPipeline.flattenCoursesToSections(courses);
        }

        const criteriaMap = this.getCriteriaMap();

        // Remove bookmark from criteriaMap — it's handled post-pipeline in filterCourses()
        criteriaMap.delete('bookmark');

        if (criteriaMap.size === 0) {
            return this.sectionPipeline.flattenCoursesToSections(courses);
        }

        const sections = this.sectionPipeline.flattenCoursesToSections(courses);
        return this.sectionPipeline.applyFilters(sections, criteriaMap);
    }

    // Reconstruct Course[] from FilterableSection[]
    resolveToCourses(sections: FilterableSection[]): Course[] {
        return this.sectionPipeline.reconstructCourses(sections);
    }

    // Convenience: apply + resolveToCourses + bookmark + search ranking
    filterCourses(courses: Course[]): Course[] {
        if (this.isEmpty()) {
            return courses;
        }

        const filteredSections = this.apply(courses);
        let filteredCourses = this.resolveToCourses(filteredSections);

        // Apply bookmark filter at course level
        const criteriaMap = this.getCriteriaMap();
        const bookmarkCriteria = criteriaMap.get('bookmark') as BookmarkFilterCriteria | undefined;
        if (bookmarkCriteria && bookmarkCriteria.showBookmarkedOnly && this.getBookmarkedCourseIds) {
            const bookmarkedIds = new Set(this.getBookmarkedCourseIds());
            filteredCourses = filteredCourses.filter(course => bookmarkedIds.has(course.id));
        }

        // Apply search text ranking (reorder by relevance)
        const searchCriteria = criteriaMap.get('searchText');
        if (searchCriteria && searchCriteria.query) {
            filteredCourses = rankCoursesByRelevance(filteredCourses, searchCriteria.query);
        }

        return filteredCourses;
    }

    // Apply filters excluding specific filter IDs, resolve to courses
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

    // Filter options for UI
    getFilterOptions(filterId: string, courses: Course[]): any {
        switch (filterId) {
            case 'department':
                return this.getDepartmentOptions(courses);
            case 'professor':
                return this.getProfessorOptions(courses);
            case 'term':
                return this.getTermOptions(courses);
            case 'sectionCode':
                return this.getSectionCodeOptions(courses);
            case 'periodDays':
                return [
                    { value: 'mon', label: 'Monday' },
                    { value: 'tue', label: 'Tuesday' },
                    { value: 'wed', label: 'Wednesday' },
                    { value: 'thu', label: 'Thursday' },
                    { value: 'fri', label: 'Friday' }
                ];
            default:
                return null;
        }
    }

    private getCriteriaMap(): Map<string, any> {
        const criteriaMap = new Map<string, any>();
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

    private getProfessorOptions(courses: Course[]): string[] {
        return getAvailableProfessors(courses);
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

    private getSectionCodeOptions(courses: Course[]): { value: string; label: string }[] {
        const sectionCodes = new Set<string>();
        courses.forEach(course => {
            const sections = getAllSections(course);
            sections.forEach(section => {
                if (section.number && section.number.trim()) {
                    sectionCodes.add(section.number.trim());
                }
            });
        });
        const codeArray = Array.from(sectionCodes).sort();
        return codeArray.map(code => ({ value: code, label: code }));
    }
}
