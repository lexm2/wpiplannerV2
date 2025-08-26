import { Period, Section } from '../types/types';
import { SelectedCourse } from '../types/schedule';
import { PeriodDaysFilter } from '../core/filters/PeriodDaysFilter';
import { PeriodProfessorFilter } from '../core/filters/PeriodProfessorFilter';
import { PeriodTypeFilter } from '../core/filters/PeriodTypeFilter';
import { PeriodTermFilter } from '../core/filters/PeriodTermFilter';
import { PeriodAvailabilityFilter } from '../core/filters/PeriodAvailabilityFilter';
import { PeriodConflictFilter } from '../core/filters/PeriodConflictFilter';
import { SectionCodeFilter } from '../core/filters/SectionCodeFilter';
import { SearchTextFilter } from '../core/filters';
import { ConflictDetector } from '../core/ConflictDetector';
import { SectionFilter, SelectedCourseFilter, CourseFilter, FilterEventListener, BaseFilter } from '../types/filters';
import { FilterState } from '../core/FilterState';
import { RequiredStatusFilter } from '../core/filters/RequiredStatusFilter';
import { SectionStatusFilter } from '../core/filters/SectionStatusFilter';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ScheduleFilterService - Specialized Schedule-Level Filtering Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ARCHITECTURE ROLE:
 * - Schedule-specific filtering engine extending base FilterService capabilities
 * - Period and Section level constraint processing for schedule generation
 * - Time conflict detection and resolution during filtering
 * - Advanced filtering coordinator for complex schedule requirements
 * - Bridge between course-level filtering and schedule generation algorithms
 * 
 * DEPENDENCIES:
 * - FilterService → Base filtering infrastructure and filter registration
 * - SearchService → Text-based search coordination across filtered data
 * - ConflictDetector → Time conflict detection between course sections
 * - Period/Section/Course types → Deep data structure access for filtering
 * - SelectedCourse types → User selection state integration
 * - 9 specialized filter classes → Period-level and section-level constraints
 * 
 * USED BY:
 * - ScheduleController → Schedule generation UI with advanced filtering
 * - ScheduleFilterModalController → Modal UI for schedule-specific filter controls
 * - MainController → Service initialization and cross-service wiring
 * - Schedule generation algorithms → Pre-filtering courses for valid combinations
 * 
 * FILTER SPECIALIZATION (Period-Level Filters):
 * Time-Based:
 * - PeriodDaysFilter → Filter by specific days of week
 * - PeriodAvailabilityFilter → Filter by seat availability
 * - PeriodConflictFilter → Detect and resolve time conflicts
 * 
 * Content-Based:
 * - PeriodProfessorFilter → Filter by instructor preferences
 * - PeriodTypeFilter → Filter by class type (Lecture, Lab, Discussion)
 * - PeriodTermFilter → Filter by academic term
 * 
 * Section-Based:
 * - SectionCodeFilter → Filter by section codes (A01, B02, etc.)
 * - SearchTextFilter → Text search across course content
 * 
 * DATA FLOW:
 * Schedule Filtering Process:
 * 1. Receive course list with user selections from ProfileStateManager (SelectedCourse[])
 * 2. Apply registered filters in priority order (search, period-specific, section-specific)
 * 3. For each course, dive into Section[] and Period[] arrays
 * 4. Apply period-specific filters (time, professor, type, conflicts)
 * 5. Filter sections based on availability and user constraints
 * 6. Return filtered data suitable for schedule generation
 * 7. Coordinate with ConflictDetector for final validation
 * 
 * Filter Coordination:
 * 1. Independent filter registration system with three specialized maps
 * 2. Schedule-specific filter implementations for periods and sections
 * 3. Priority-based filter application for optimal performance
 * 4. Integrates ConflictDetector for time-based validation
 * 5. Provides localStorage persistence for filter state
 * 
 * KEY FEATURES:
 * - Deep data structure filtering (Course → Section → Period hierarchy)
 * - Time conflict detection integration during filtering process
 * - Schedule-specific constraint processing (availability, time slots, conflicts)
 * - Advanced filter combinations with persistent state
 * - Real-time filter application with performance optimization
 * - Integration with schedule generation algorithms
 * - Modal UI coordination for complex filter controls
 * 
 * INTEGRATION POINTS:
 * - Extends FilterService base class functionality
 * - Coordinates with SearchService for unified search experience
 * - Integrates ConflictDetector for schedule validation
 * - Provides data to ScheduleController for UI rendering
 * - Coordinates with ScheduleFilterModalController for user interaction
 * - Supports schedule generation algorithms with pre-filtered data
 * 
 * ARCHITECTURAL PATTERNS:
 * - Decorator: Extends FilterService with schedule-specific capabilities
 * - Strategy: Pluggable filter implementations for different constraints
 * - Composite: Combines multiple filter types for complex filtering
 * - Coordinator: Manages interaction between filtering and conflict detection
 * 
 * RECENT CHANGES:
 * - Added missing Section type import during storage system cleanup
 * - Fixed TypeScript compilation errors during deprecated class removal
 * - Maintained functionality while removing CourseManager dependencies
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export class ScheduleFilterService {
    private filterState: FilterState;
    private registeredCourseFilters!: Map<string, CourseFilter>;
    private registeredSectionFilters!: Map<string, SectionFilter>;
    private registeredSelectedCourseFilters!: Map<string, SelectedCourseFilter>;
    private periodConflictFilter: PeriodConflictFilter | null = null;
    
    constructor() {
        this.filterState = new FilterState();
        
        this.initializeFilters();
    }
    
    setConflictDetector(conflictDetector: ConflictDetector): void {
        this.periodConflictFilter = new PeriodConflictFilter(conflictDetector);
        this.registerSectionFilter(this.periodConflictFilter);
    }
    
    private initializeFilters(): void {
        // Initialize filter registration Maps
        this.registeredCourseFilters = new Map();
        this.registeredSectionFilters = new Map();
        this.registeredSelectedCourseFilters = new Map();
        
        // Register CourseFilter implementations internally
        this.registerCourseFilter(new SearchTextFilter());
        
        // Register SectionFilter implementations using registration methods
        this.registerSectionFilter(new PeriodDaysFilter());
        this.registerSectionFilter(new PeriodProfessorFilter());
        this.registerSectionFilter(new PeriodTypeFilter());
        this.registerSectionFilter(new PeriodTermFilter());
        this.registerSectionFilter(new PeriodAvailabilityFilter());
        this.registerSectionFilter(new SectionCodeFilter());
        
        // Register SelectedCourseFilter implementations using registration methods
        this.registerSelectedCourseFilter(new RequiredStatusFilter());
        this.registerSelectedCourseFilter(new SectionStatusFilter());
    }
    
    // Course Filter Registration
    registerCourseFilter(filter: CourseFilter): void {
        this.registeredCourseFilters.set(filter.id, filter);
    }
    
    unregisterCourseFilter(filterId: string): boolean {
        const removed = this.registeredCourseFilters.delete(filterId);
        if (removed) {
            this.removeFilter(filterId);
        }
        return removed;
    }
    
    getCourseFilter(filterId: string): CourseFilter | undefined {
        return this.registeredCourseFilters.get(filterId);
    }
    
    getAvailableCourseFilters(): CourseFilter[] {
        return Array.from(this.registeredCourseFilters.values());
    }

    // Section Filter Registration  
    registerSectionFilter(filter: SectionFilter): void {
        this.registeredSectionFilters.set(filter.id, filter);
    }
    
    unregisterSectionFilter(filterId: string): boolean {
        const removed = this.registeredSectionFilters.delete(filterId);
        if (removed) {
            this.removeFilter(filterId);
        }
        return removed;
    }
    
    getSectionFilter(filterId: string): SectionFilter | undefined {
        return this.registeredSectionFilters.get(filterId);
    }
    
    getAvailableSectionFilters(): SectionFilter[] {
        return Array.from(this.registeredSectionFilters.values());
    }
    
    // SelectedCourse Filter Registration
    registerSelectedCourseFilter(filter: SelectedCourseFilter): void {
        this.registeredSelectedCourseFilters.set(filter.id, filter);
    }
    
    unregisterSelectedCourseFilter(filterId: string): boolean {
        const removed = this.registeredSelectedCourseFilters.delete(filterId);
        if (removed) {
            this.removeFilter(filterId);
        }
        return removed;
    }
    
    getSelectedCourseFilter(filterId: string): SelectedCourseFilter | undefined {
        return this.registeredSelectedCourseFilters.get(filterId);
    }
    
    getAvailableSelectedCourseFilters(): SelectedCourseFilter[] {
        return Array.from(this.registeredSelectedCourseFilters.values());
    }
    
    // Unified Filter Lookup
    private getAnyRegisteredFilter(filterId: string): BaseFilter | undefined {
        return this.registeredCourseFilters.get(filterId) ||
               this.registeredSectionFilters.get(filterId) ||
               this.registeredSelectedCourseFilters.get(filterId);
    }
    
    // Direct filter management methods
    addFilter(filterId: string, criteria: any): boolean {
        const filter = this.getAnyRegisteredFilter(filterId);
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
        const filter = this.getAnyRegisteredFilter(filterId);
        if (!filter || !filter.isValidCriteria(criteria)) {
            return false;
        }
        
        const displayValue = filter.getDisplayValue(criteria);
        return this.filterState.updateFilter(filterId, criteria, displayValue);
    }
    
    removeFilter(filterId: string): boolean {
        return this.filterState.removeFilter(filterId);
    }
    
    clearAllFilters(): void {
        this.filterState.clearFilters();
    }
    
    clearFilters(): void {
        this.filterState.clearFilters();
    }
    
    toggleFilter(filterId: string, criteria: any): boolean {
        if (this.hasFilter(filterId)) {
            this.removeFilter(filterId);
            return false;
        } else {
            return this.addFilter(filterId, criteria);
        }
    }
    
    hasFilter(filterId: string): boolean {
        return this.filterState.hasFilter(filterId);
    }
    
    getActiveFilters() {
        return this.filterState.getActiveFilters();
    }
    
    getFilterCount(): number {
        return this.filterState.getFilterCount();
    }
    
    isEmpty(): boolean {
        return this.filterState.isEmpty();
    }
    
    addEventListener(listener: FilterEventListener): void {
        this.filterState.addEventListener(listener);
    }
    
    removeEventListener(listener: FilterEventListener): void {
        this.filterState.removeEventListener(listener);
    }
    
    saveFiltersToStorage(): void {
        // Use a different key for schedule filters, exclude transient filters
        const serialized = this.filterState.serialize(['searchText', 'department']);
        localStorage.setItem('wpi-schedule-filters', serialized);
    }
    
    loadFiltersFromStorage(): boolean {
        const stored = localStorage.getItem('wpi-schedule-filters');
        if (stored) {
            const success = this.filterState.deserialize(stored);
            // Remove any loaded search or department filters
            this.removeFilter('searchText');
            this.removeFilter('department');
            return success;
        }
        return false;
    }
    
    getFilterSummary(): string {
        const activeFilters = this.getActiveFilters();
        if (activeFilters.length === 0) {
            return 'No active filters';
        }
        
        if (activeFilters.length === 1) {
            return activeFilters[0].displayValue;
        }
        
        return `${activeFilters.length} active filters`;
    }
    
    // Main filtering method - now returns filtered periods with course context
    filterPeriods(selectedCourses: SelectedCourse[]): Array<{course: SelectedCourse, period: Period}> {
        if (this.isEmpty()) {
            return this.getAllPeriodsWithContext(selectedCourses);
        }
        
        const activeFilters = this.getActiveFilters();
        
        // Get all periods from selected courses (selectedCourses already filtered by ProfileStateManager)
        let allPeriods = this.getAllPeriodsWithContext(selectedCourses);
        
        // Sort active filters by priority using registered filter priorities
        const sortedActiveFilters = activeFilters.sort((a, b) => {
            const filterA = this.registeredSectionFilters.get(a.id);
            const filterB = this.registeredSectionFilters.get(b.id);
            const priorityA = filterA?.priority ?? 100; // Default priority for missing filters
            const priorityB = filterB?.priority ?? 100;
            return priorityA - priorityB;
        });

        // Apply period-based filters in priority order using registered filters
        for (const activeFilter of sortedActiveFilters) {
            if (activeFilter.id === 'searchText') {
                // Handle search text by filtering periods based on course/period content
                const query = activeFilter.criteria.query?.toLowerCase().trim();
                if (query) {
                    allPeriods = allPeriods.filter(item => {
                        const course = item.course.course;
                        const period = item.period;
                        
                        // Search in course info
                        if (course.name.toLowerCase().includes(query) ||
                            course.number.toLowerCase().includes(query) ||
                            course.department.abbreviation.toLowerCase().includes(query)) {
                            return true;
                        }
                        
                        // Search in period info  
                        if (period.professor.toLowerCase().includes(query) ||
                            period.type.toLowerCase().includes(query) ||
                            period.building.toLowerCase().includes(query) ||
                            period.room.toLowerCase().includes(query) ||
                            period.location.toLowerCase().includes(query)) {
                            return true;
                        }
                        
                        return false;
                    });
                }
            } else if (activeFilter.id === 'periodConflict' && this.periodConflictFilter) {
                // Special handling for conflict filter which needs section context
                const sections = this.periodsToSections(allPeriods);
                const validSections = this.periodConflictFilter.applyToSectionsWithContext(sections, {
                    ...activeFilter.criteria,
                    selectedCourses: selectedCourses
                });
                allPeriods = this.sectionsToPeriodsWithContext(validSections);
            } else {
                // Use registered filters with applyToPeriods method
                const sectionFilter = this.registeredSectionFilters.get(activeFilter.id);
                if (sectionFilter && sectionFilter.applyToPeriods) {
                    const periods = allPeriods.map(item => item.period);
                    const filteredPeriods = sectionFilter.applyToPeriods(periods, activeFilter.criteria);
                    const filteredPeriodSet = new Set(filteredPeriods);
                    allPeriods = allPeriods.filter(item => filteredPeriodSet.has(item.period));
                }
            }
        }
        
        return allPeriods;
    }
    
    // Helper method to extract all sections with their course context
    private getAllSectionsWithContext(selectedCourses: SelectedCourse[]): Array<{course: SelectedCourse, section: Section}> {
        const sectionsWithContext: Array<{course: SelectedCourse, section: Section}> = [];
        
        for (const selectedCourse of selectedCourses) {
            // Get all sections for this course
            for (const section of selectedCourse.course.sections) {
                sectionsWithContext.push({
                    course: selectedCourse,
                    section: section
                });
            }
        }
        
        return sectionsWithContext;
    }

    // Convert sections back to periods with course context
    private sectionsToPeriodsWithContext(sectionsWithContext: Array<{course: SelectedCourse, section: Section}>): Array<{course: SelectedCourse, period: Period}> {
        const periodsWithContext: Array<{course: SelectedCourse, period: Period}> = [];
        
        for (const item of sectionsWithContext) {
            for (const period of item.section.periods) {
                periodsWithContext.push({
                    course: item.course,
                    period: period
                });
            }
        }
        
        return periodsWithContext;
    }

    // Convert periods back to sections (used for conflict detection)
    private periodsToSections(periodsWithContext: Array<{course: SelectedCourse, period: Period}>): Array<{course: SelectedCourse, section: Section}> {
        const sectionMap = new Map<string, {course: SelectedCourse, section: Section}>();
        
        for (const item of periodsWithContext) {
            // Find the section that contains this period
            const section = item.course.course.sections.find(s => s.periods.includes(item.period));
            if (section) {
                const sectionKey = `${item.course.course.id}-${section.number}`;
                if (!sectionMap.has(sectionKey)) {
                    sectionMap.set(sectionKey, {
                        course: item.course,
                        section: section
                    });
                }
            }
        }
        
        return Array.from(sectionMap.values());
    }

    // Helper method to extract all periods with their course context
    private getAllPeriodsWithContext(selectedCourses: SelectedCourse[]): Array<{course: SelectedCourse, period: Period}> {
        const periodsWithContext: Array<{course: SelectedCourse, period: Period}> = [];
        
        for (const selectedCourse of selectedCourses) {
            // Get all sections for this course (not just selected one for search purposes)
            for (const section of selectedCourse.course.sections) {
                for (const period of section.periods) {
                    periodsWithContext.push({
                        course: selectedCourse,
                        period: period
                    });
                }
            }
        }
        
        return periodsWithContext;
    }
    
    
    // Section-based filtering method - returns filtered sections with course context
    filterSections(selectedCourses: SelectedCourse[]): Array<{course: SelectedCourse, section: Section}> {
        if (this.isEmpty()) {
            return this.getAllSectionsWithContext(selectedCourses);
        }
        
        const activeFilters = this.getActiveFilters();
        
        // Get all sections from selected courses (selectedCourses already filtered by ProfileStateManager)
        let allSections = this.getAllSectionsWithContext(selectedCourses);
        
        
        // Sort active filters by priority using registered filter priorities
        const sortedSectionFilters = activeFilters.sort((a, b) => {
            const filterA = this.registeredSectionFilters.get(a.id);
            const filterB = this.registeredSectionFilters.get(b.id);
            const priorityA = filterA?.priority ?? 100; // Default priority for missing filters
            const priorityB = filterB?.priority ?? 100;
            return priorityA - priorityB;
        });

        // Apply section-based filters in priority order
        for (const activeFilter of sortedSectionFilters) {
            if (activeFilter.id === 'searchText') {
                // Handle search text by filtering sections based on course/section content
                const query = activeFilter.criteria.query?.toLowerCase().trim();
                if (query) {
                    allSections = allSections.filter(item => {
                        const course = item.course.course;
                        const section = item.section;
                        
                        // Search in course info
                        if (course.name.toLowerCase().includes(query) ||
                            course.number.toLowerCase().includes(query) ||
                            course.department.abbreviation.toLowerCase().includes(query)) {
                            return true;
                        }
                        
                        // Search in section number
                        if (section.number.toLowerCase().includes(query)) {
                            return true;
                        }
                        
                        // Search in any period info within the section
                        return section.periods.some(period =>
                            period.professor.toLowerCase().includes(query) ||
                            period.type.toLowerCase().includes(query) ||
                            period.building.toLowerCase().includes(query) ||
                            period.room.toLowerCase().includes(query) ||
                            period.location.toLowerCase().includes(query)
                        );
                    });
                }
            } else if (activeFilter.id === 'periodConflict' && this.periodConflictFilter) {
                // Special handling for conflict filter which needs additional context
                allSections = this.periodConflictFilter.applyToSectionsWithContext(allSections, {
                    ...activeFilter.criteria,
                    selectedCourses: selectedCourses
                });
            } else {
                const sectionFilter = this.registeredSectionFilters.get(activeFilter.id);
                if (sectionFilter && sectionFilter.applyToSectionsWithContext) {
                    allSections = sectionFilter.applyToSectionsWithContext(allSections, activeFilter.criteria);
                }
            }
        }
        
        return allSections;
    }
    
    // Convert filtered periods back to unique selected courses for display
    filterSelectedCourses(selectedCourses: SelectedCourse[]): SelectedCourse[] {
        const filteredPeriods = this.filterPeriods(selectedCourses);
        
        // Get unique courses from filtered periods
        const uniqueCourseIds = new Set(filteredPeriods.map(item => item.course.course.id));
        return selectedCourses.filter(sc => uniqueCourseIds.has(sc.course.id));
    }

    // Apply SelectedCourseFilter implementations to filter selected courses
    applySelectedCourseFilters(selectedCourses: SelectedCourse[]): SelectedCourse[] {
        if (this.isEmpty()) {
            return selectedCourses;
        }

        const activeFilters = this.getActiveFilters();
        let filteredSelectedCourses = selectedCourses;

        // Sort active filters by priority (lower number = higher priority = applied first)
        const sortedSelectedCourseFilters = activeFilters.sort((a, b) => {
            const filterA = this.registeredSelectedCourseFilters.get(a.id);
            const filterB = this.registeredSelectedCourseFilters.get(b.id);
            const priorityA = filterA?.priority ?? 100;
            const priorityB = filterB?.priority ?? 100;
            return priorityA - priorityB;
        });

        // Apply SelectedCourseFilter implementations in priority order
        for (const activeFilter of sortedSelectedCourseFilters) {
            const selectedCourseFilter = this.registeredSelectedCourseFilters.get(activeFilter.id);
            if (selectedCourseFilter) {
                filteredSelectedCourses = selectedCourseFilter.applyToSelectedCourses(
                    filteredSelectedCourses, 
                    activeFilter.criteria
                );
            }
        }

        return filteredSelectedCourses;
    }
    
    // Get available filter options specific to selected courses
    getFilterOptions(filterId: string, selectedCourses: SelectedCourse[]): any {
        switch (filterId) {
            case 'periodDays':
                return [
                    { value: 'mon', label: 'Monday' },
                    { value: 'tue', label: 'Tuesday' },
                    { value: 'wed', label: 'Wednesday' },
                    { value: 'thu', label: 'Thursday' },
                    { value: 'fri', label: 'Friday' }
                ];
            case 'periodProfessor':
                return this.getAvailableProfessors(selectedCourses);
            case 'periodType':
                return this.getAvailablePeriodTypes(selectedCourses);
            case 'periodTerm':
                return this.getAvailableTerms(selectedCourses);
            case 'sectionCode':
                return this.getAvailableSectionCodes(selectedCourses);
            case 'requiredStatus':
                return [
                    { value: 'all', label: 'All Courses' },
                    { value: 'required', label: 'Required Courses' },
                    { value: 'optional', label: 'Optional Courses' }
                ];
            case 'sectionStatus':
                return [
                    { value: 'all', label: 'All Courses' },
                    { value: 'selected', label: 'With Selected Section' },
                    { value: 'unselected', label: 'Without Selected Section' }
                ];
            default:
                return null;
        }
    }
    
    
    private getAvailableProfessors(selectedCourses: SelectedCourse[]): { value: string; label: string }[] {
        const professors = new Set<string>();
        
        selectedCourses.forEach(sc => {
            sc.course.sections.forEach(section => {
                section.periods.forEach(period => {
                    if (period.professor && period.professor.trim()) {
                        professors.add(period.professor.trim());
                    }
                });
            });
        });
        
        const profArray = Array.from(professors).sort();
        return profArray.map(prof => ({
            value: prof,
            label: prof
        }));
    }
    
    private getAvailablePeriodTypes(selectedCourses: SelectedCourse[]): { value: string; label: string }[] {
        const types = new Set<string>();
        
        selectedCourses.forEach(sc => {
            sc.course.sections.forEach(section => {
                section.periods.forEach(period => {
                    if (period.type && period.type.trim()) {
                        types.add(period.type.trim());
                    }
                });
            });
        });
        
        const typeArray = Array.from(types).sort();
        return typeArray.map(type => ({
            value: type,
            label: this.formatPeriodType(type)
        }));
    }
    
    
    private formatPeriodType(type: string): string {
        const lower = type.toLowerCase();
        
        if (lower.includes('lec') || lower.includes('lecture')) return 'Lecture';
        if (lower.includes('lab')) return 'Lab';
        if (lower.includes('dis') || lower.includes('discussion')) return 'Discussion';
        if (lower.includes('rec') || lower.includes('recitation')) return 'Recitation';
        if (lower.includes('sem') || lower.includes('seminar')) return 'Seminar';
        if (lower.includes('studio')) return 'Studio';
        if (lower.includes('conference') || lower.includes('conf')) return 'Conference';
        
        return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    }
    
    private getAvailableSectionCodes(selectedCourses: SelectedCourse[]): { value: string; label: string }[] {
        const sectionCodes = new Set<string>();
        
        selectedCourses.forEach(sc => {
            sc.course.sections.forEach(section => {
                if (section.number && section.number.trim()) {
                    sectionCodes.add(section.number.trim());
                }
            });
        });
        
        const codeArray = Array.from(sectionCodes).sort();
        return codeArray.map(code => ({
            value: code,
            label: code
        }));
    }
    
    private getAvailableTerms(selectedCourses: SelectedCourse[]): { value: string; label: string }[] {
        console.log(`[DEBUG] getAvailableTerms called with ${selectedCourses.length} courses`);
        const terms = new Set<string>();
        
        selectedCourses.forEach(sc => {
            console.log(`[DEBUG] Processing course ${sc.course.id} with ${sc.course.sections.length} sections`);
            sc.course.sections.forEach(section => {
                console.log(`[DEBUG] Section ${section.number}: computedTerm = "${section.computedTerm}"`);
                
                // Filter out invalid computed terms
                if (section.computedTerm && 
                    section.computedTerm.trim() && 
                    section.computedTerm !== 'undefined' && 
                    typeof section.computedTerm === 'string') {
                    terms.add(section.computedTerm.trim());
                } else {
                    console.warn(`[WARN] Invalid computedTerm for section ${section.number}: "${section.computedTerm}"`);
                }
            });
        });
        
        const termArray = Array.from(terms).sort();
        console.log(`[DEBUG] Available terms found:`, termArray);
        return termArray.map(term => ({
            value: term,
            label: this.formatTermName(term)
        }));
    }
    
    private formatTermName(term: string): string {
        const normalized = term.toUpperCase().trim();
        
        const termMap: { [key: string]: string } = {
            'A': 'A Term',
            'B': 'B Term',
            'C': 'C Term', 
            'D': 'D Term'
        };
        
        return termMap[normalized] || term.toUpperCase();
    }
}