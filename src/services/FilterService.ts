import { Course, Department } from '../types/types';
import { CourseFilter, FilterEventListener, ActiveFilter } from '../types/filters';
import { FilterState } from '../core/FilterState';
import { SearchService } from './searchService';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FilterService - Central Filtering Coordination & Selective Persistence Manager
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ARCHITECTURE ROLE:
 * - Central coordination hub for the comprehensive filtering system
 * - Bridge between core filter infrastructure and UI components
 * - Selective persistence coordinator preventing search/department filter storage
 * - Event-driven filter state management with cross-component synchronization
 * - Service layer coordinator for FilterState and SearchService integration
 * 
 * KEY DEPENDENCIES:
 * Core Systems:
 * - FilterState → Core filter state management and event coordination
 * - SearchService → Text-based search functionality and course indexing
 * - CourseFilter implementations → 15+ specialized filter types (Department, Availability, etc.)
 * - localStorage → Selective persistence for non-transient filters only
 * 
 * Filter Architecture:
 * - DepartmentFilter, AvailabilityFilter, CreditRangeFilter → Course-level filtering
 * - SearchTextFilter, ProfessorFilter, LocationFilter → Content-based filtering  
 * - PeriodConflictFilter, TermFilter → Advanced scheduling filters
 * - CourseSelectionFilter, RequiredStatusFilter → State-based filtering
 * 
 * USED BY:
 * - MainController → Central application coordination and filter setup
 * - CourseController → Course display filtering and search integration
 * - FilterModalController → Advanced filtering UI with real-time updates
 * - ScheduleFilterService → Specialized schedule-specific filtering
 * - DepartmentSyncService → Department selection synchronization
 * 
 * SELECTIVE PERSISTENCE STRATEGY:
 * Persistent Filters (Saved to localStorage):
 * - Department selections, credit range, availability preferences
 * - Professor preferences, location constraints, time slot filters
 * - User-configured advanced filters for session continuity
 * 
 * Transient Filters (NOT persisted):
 * - Search text queries → Reset on page reload for clean search experience
 * - Department selections → Reset to "All Departments" on page reload
 * - Temporary filter states during modal interactions
 * 
 * PERSISTENCE EXCLUSION ARCHITECTURE:
 * ```
 * saveFiltersToStorage():
 *   FilterState.serialize(['searchText', 'department']) → Excludes transient filters
 *   localStorage.setItem() → Saves only persistent filter state
 * 
 * loadFiltersFromStorage():
 *   FilterState.deserialize() → Loads saved filters
 *   removeFilter('searchText', 'department') → Cleans any legacy transient filters
 * ```
 * 
 * FILTER COORDINATION FLOW:
 * 1. Filter Registration:
 *    - CourseFilter implementations register with FilterService
 *    - Strategy pattern enables pluggable filter architecture
 *    - Each filter provides validation, application, and display logic
 * 
 * 2. State Management:
 *    - addFilter() / removeFilter() coordinate with FilterState
 *    - Event notifications trigger UI updates across components
 *    - Combined filtering through filterCourses() optimizes performance
 * 
 * 3. Search Integration:
 *    - searchAndFilter() combines text search with active filters
 *    - SearchService provides full-text indexing and ranking
 *    - Search text automatically managed as transient 'searchText' filter
 * 
 * 4. Persistence Coordination:
 *    - Selective saveFiltersToStorage() excludes search/department
 *    - loadFiltersFromStorage() cleanly restores persistent state
 *    - Clean session start with no transient filter pollution
 * 
 * DATA FLOW ARCHITECTURE:
 * ```
 * User Interaction:
 * UI Component → FilterService.addFilter() → FilterState → Event → UI Updates
 * 
 * Search Flow:
 * Search Input → searchAndFilter() → addFilter('searchText') → filterCourses() → Results
 * 
 * Persistence Flow:
 * Filter Changes → saveFiltersToStorage() → serialize(excludeList) → localStorage
 * Page Load → loadFiltersFromStorage() → deserialize() → removeTransient()
 * ```
 * 
 * KEY ARCHITECTURAL FEATURES:
 * - Strategy Pattern: Pluggable filter registration and application
 * - Observer Pattern: Event-driven updates across UI components
 * - Command Pattern: Filter add/remove/update operations
 * - State Management: Centralized filter state with selective persistence
 * - Performance Optimization: Combined filtering reduces redundant operations
 * - Clean Session Architecture: Transient filters reset for optimal UX
 * 
 * INTEGRATION POINTS:
 * - FilterState integration for event-driven state management
 * - SearchService integration for text-based filtering
 * - localStorage integration with selective persistence strategy
 * - UI controller integration through event system
 * - Filter registration system for extensible architecture
 * 
 * ARCHITECTURAL PATTERNS:
 * - Service Coordinator: Manages multiple filter systems
 * - Selective Persistence: Saves only appropriate state data
 * - Event Hub: Coordinates filter change notifications
 * - Strategy Registry: Manages pluggable filter implementations
 * - State Facade: Simplifies complex filter state interactions
 * 
 * DESIGN BENEFITS:
 * - Clean Sessions: Users start with fresh search/department state
 * - Selective Persistence: Important preferences saved, transient state reset
 * - Event-Driven: Loose coupling between filters and UI components
 * - Extensible: Easy addition of new filter types
 * - Performance: Optimized filtering with minimal redundant operations
 * - User Experience: Predictable filter behavior with session consistency
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */
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
        const serialized = this.filterState.serialize(['searchText', 'department']);
        localStorage.setItem('wpi-course-filters', serialized);
    }
    
    loadFiltersFromStorage(): boolean {
        const stored = localStorage.getItem('wpi-course-filters');
        if (stored) {
            const success = this.filterState.deserialize(stored);
            // Remove any loaded search or department filters
            this.removeFilter('searchText');
            this.removeFilter('department');
            return success;
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