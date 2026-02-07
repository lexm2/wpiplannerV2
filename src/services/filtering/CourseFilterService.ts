import { Course } from '../../types/types';
import { FilterEventListener, ActiveFilter } from '../../types/filters';
import { FilterState } from '../../core/filtering/FilterState';
import { SearchService } from './searchService';
import { getAllSections } from '../../utils/courseUtils';
import { SectionFilterPipeline, SectionBasedFilter } from '../../core/filtering/SectionFilterPipeline';
import { ConflictFilter } from '../../core/filtering/filters/ConflictFilter';
import { ConflictDetector } from '../../core/scheduling/ConflictEngine';
export class CourseFilterService {
    private filterState: FilterState;
    private registeredFilters: Map<string, SectionBasedFilter> = new Map();
    private searchService: SearchService;
    private debugLogging: boolean = false;
    private sectionPipeline: SectionFilterPipeline;
    private getBookmarkedCourseIds: () => string[];

    constructor(searchService: SearchService, getBookmarkedCourseIds: () => string[]) {
        this.filterState = new FilterState();
        this.searchService = searchService;
        this.sectionPipeline = new SectionFilterPipeline();
        this.getBookmarkedCourseIds = getBookmarkedCourseIds;
    }

    setConflictDetector(conflictDetector: ConflictDetector): void {
        const periodConflictFilter = new ConflictFilter();
        this.registerFilter(periodConflictFilter);
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
    
    // Filter Management
    addFilter(filterId: string, criteria: any): boolean {
        // Special handling for course-level filters that don't use section pipeline
        if (filterId === 'graduateLevel') {
            const levelNames: Record<string, string> = {
                'all': 'All Levels',
                'undergraduate': 'Undergraduate Only',
                'graduate': 'Graduate Only'
            };
            const displayValue = levelNames[criteria.level] || 'Unknown Level';
            this.filterState.addFilter(filterId, 'Course Level', criteria, displayValue);
            return true;
        }

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

    // Helper method to get criteria map for filters that need to check other active filters
    private getCriteriaMap(): Map<string, any> {
        const criteriaMap = new Map<string, any>();
        const activeFilters = this.getActiveFilters();
        for (const filter of activeFilters) {
            criteriaMap.set(filter.id, filter.criteria);
        }
        return criteriaMap;
    }

    // Configuration methods
    setDebugLogging(enabled: boolean): void {
        this.debugLogging = enabled;
    }
    
    getFilterCount(): number {
        return this.filterState.getFilterCount();
    }
    
    isEmpty(): boolean {
        return this.filterState.isEmpty();
    }
    
    /**
     * Main filtering method using section-based filtering with priority queue execution.
     * Filters sections first, then reconstructs courses that have at least one matching section.
     */
    filterCourses(courses: Course[]): Course[] {
        if (this.isEmpty()) {
            return courses;
        }

        const criteriaMap = this.getCriteriaMap();

        if (this.debugLogging) {
            console.log(`Filtering ${courses.length} courses with ${criteriaMap.size} active filters`);
        }

        let filteredCourses = this.sectionPipeline.filterCourses(courses, criteriaMap);

        if (this.debugLogging) {
            console.log(`Filtered result: ${filteredCourses.length} courses`);
        }

        // Apply graduate level filter at course level
        const graduateLevelCriteria = criteriaMap.get('graduateLevel');
        if (graduateLevelCriteria && graduateLevelCriteria.level && graduateLevelCriteria.level !== 'all') {
            filteredCourses = filteredCourses.filter(course => {
                const isGraduate = course.isGraduate ?? false;
                if (graduateLevelCriteria.level === 'graduate') {
                    return isGraduate;
                } else if (graduateLevelCriteria.level === 'undergraduate') {
                    return !isGraduate;
                }
                return true;
            });

            if (this.debugLogging) {
                console.log(`Filtered by graduate level: ${filteredCourses.length} courses`);
            }
        }

        // Apply bookmark filter at course level
        const bookmarkCriteria = criteriaMap.get('bookmark');
        if (bookmarkCriteria && bookmarkCriteria.showBookmarkedOnly) {
            const bookmarkedIds = new Set(this.getBookmarkedCourseIds());
            filteredCourses = filteredCourses.filter(course => bookmarkedIds.has(course.id));

            if (this.debugLogging) {
                console.log(`Filtered by bookmarks: ${filteredCourses.length} courses`);
            }
        }

        const searchCriteria = criteriaMap.get('searchText');
        if (searchCriteria && searchCriteria.query) {
            filteredCourses = this.searchService.rankCoursesByRelevance(filteredCourses, searchCriteria.query);

            if (this.debugLogging) {
                console.log(`Ranked search results for query: "${searchCriteria.query}"`);
            }
        }

        return filteredCourses;
    }

    
    
    // Event Handling
    addEventListener(listener: FilterEventListener): void {
        this.filterState.addEventListener(listener);
    }

    removeEventListener(listener: FilterEventListener): void {
        this.filterState.removeEventListener(listener);
    }
    
    // Helper Methods
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
    
    
    // Utility for getting filter options
    getFilterOptions(filterId: string, allCourses: Course[]): any {
        switch (filterId) {
            case 'department':
                return this.getDepartmentOptions(allCourses);
            case 'professor':
                return this.getProfessorOptions(allCourses);
            case 'term':
                return this.getTermOptions(allCourses);
            default:
                return null;
        }
    }
    
    private getDepartmentOptions(courses: Course[]): string[] {
        const departments = new Set<string>();
        courses.forEach(course => departments.add(course.departmentAbbr));
        return Array.from(departments).sort();
    }
    
    private getProfessorOptions(_courses: Course[]): string[] {
        return this.searchService.getAvailableProfessors();
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