import { Course, Department } from '../types/types';
import { CourseFilter, FilterEventListener, ActiveFilter } from '../types/filters';
import { FilterState } from '../core/FilterState';
import { SearchService } from './searchService';

export class FilterService {
    private filterState: FilterState;
    private registeredFilters: Map<string, CourseFilter> = new Map();
    private searchService: SearchService;
    
    constructor(searchService: SearchService) {
        this.filterState = new FilterState();
        this.searchService = searchService;
    }
    
    // Filter Registration
    registerFilter(filter: CourseFilter): void {
        this.registeredFilters.set(filter.id, filter);
    }
    
    unregisterFilter(filterId: string): boolean {
        const removed = this.registeredFilters.delete(filterId);
        if (removed) {
            this.removeFilter(filterId);
        }
        return removed;
    }
    
    getRegisteredFilter(filterId: string): CourseFilter | undefined {
        return this.registeredFilters.get(filterId);
    }
    
    getAvailableFilters(): CourseFilter[] {
        return Array.from(this.registeredFilters.values());
    }
    
    // Filter Management
    addFilter(filterId: string, criteria: any): boolean {
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
    
    getFilterCount(): number {
        return this.filterState.getFilterCount();
    }
    
    isEmpty(): boolean {
        return this.filterState.isEmpty();
    }
    
    // Course Filtering
    filterCourses(courses: Course[]): Course[] {
        if (this.isEmpty()) {
            return courses;
        }
        
        let filteredCourses = courses;
        const activeFilters = this.getActiveFilters();
        
        // Apply search text filter first if it exists (for better performance)
        const searchTextFilter = activeFilters.find(f => f.id === 'searchText');
        if (searchTextFilter) {
            const filter = this.registeredFilters.get(searchTextFilter.id);
            if (filter) {
                filteredCourses = filter.apply(filteredCourses, searchTextFilter.criteria);
            }
        }
        
        // Apply remaining filters sequentially
        for (const activeFilter of activeFilters) {
            if (activeFilter.id !== 'searchText') { // Skip searchText as it's already applied
                const filter = this.registeredFilters.get(activeFilter.id);
                if (filter) {
                    filteredCourses = filter.apply(filteredCourses, activeFilter.criteria);
                }
            }
        }
        
        return filteredCourses;
    }
    
    // Combined Search and Filter
    searchAndFilter(query: string, courses: Course[]): Course[] {
        // If there's a query, add/update the search text filter
        if (query.trim()) {
            this.addFilter('searchText', { query: query.trim() });
        } else {
            this.removeFilter('searchText');
        }
        
        // Apply all filters (including search text if present)
        return this.filterCourses(courses);
    }
    
    // Event Handling
    addEventListener(listener: FilterEventListener): void {
        this.filterState.addEventListener(listener);
    }
    
    removeEventListener(listener: FilterEventListener): void {
        this.filterState.removeEventListener(listener);
    }
    
    // Persistence
    saveFiltersToStorage(): void {
        const serialized = this.filterState.serialize();
        localStorage.setItem('wpi-course-filters', serialized);
    }
    
    loadFiltersFromStorage(): boolean {
        const stored = localStorage.getItem('wpi-course-filters');
        if (stored) {
            return this.filterState.deserialize(stored);
        }
        return false;
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
    
    // Convert internal filter state to SearchService format
    private convertToSearchFilter(): any {
        const criteria = this.filterState.getFilterCriteria();
        
        return {
            departments: criteria.department?.departments || [],
            timeSlots: criteria.timeSlot?.timeSlots || [],
            professors: criteria.professor?.professors || [],
            availabilityOnly: criteria.availability?.availableOnly || false,
            creditRange: criteria.creditRange ? {
                min: criteria.creditRange.min,
                max: criteria.creditRange.max
            } : undefined
        };
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
            case 'location':
                return this.getLocationOptions(allCourses);
            default:
                return null;
        }
    }
    
    private getDepartmentOptions(courses: Course[]): string[] {
        const departments = new Set<string>();
        courses.forEach(course => departments.add(course.department.abbreviation));
        return Array.from(departments).sort();
    }
    
    private getProfessorOptions(courses: Course[]): string[] {
        return this.searchService.getAvailableProfessors();
    }
    
    
    private getTermOptions(courses: Course[]): string[] {
        const terms = new Set<string>();
        courses.forEach(course => {
            course.sections.forEach(section => {
                if (section.computedTerm) {
                    terms.add(section.computedTerm);
                }
            });
        });
        return Array.from(terms).sort();
    }
    
    private getLocationOptions(courses: Course[]): { buildings: string[] } {
        const buildings = this.searchService.getAvailableBuildings();
        return { buildings };
    }
}