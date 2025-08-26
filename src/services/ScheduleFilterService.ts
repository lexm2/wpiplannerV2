import { Period, Section } from '../types/types';
import { SelectedCourse } from '../types/schedule';
import { CourseFilterService } from './CourseFilterService';
import { SearchService } from './searchService';
import { CourseSelectionFilter } from '../core/filters/CourseSelectionFilter';
import { PeriodDaysFilter } from '../core/filters/PeriodDaysFilter';
import { PeriodProfessorFilter } from '../core/filters/PeriodProfessorFilter';
import { PeriodTypeFilter } from '../core/filters/PeriodTypeFilter';
import { PeriodTermFilter } from '../core/filters/PeriodTermFilter';
import { PeriodAvailabilityFilter } from '../core/filters/PeriodAvailabilityFilter';
import { PeriodConflictFilter } from '../core/filters/PeriodConflictFilter';
import { SectionCodeFilter } from '../core/filters/SectionCodeFilter';
import { SearchTextFilter } from '../core/filters';
import { ConflictDetector } from '../core/ConflictDetector';
import { SectionFilter, SelectedCourseFilter } from '../types/filters';
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
 * - CourseSelectionFilter → Filter based on user selections
 * - SearchTextFilter → Text search across course content
 * 
 * DATA FLOW:
 * Schedule Filtering Process:
 * 1. Receive course list with user selections (SelectedCourse[])
 * 2. Apply course-level filters from base FilterService
 * 3. For each course, dive into Section[] and Period[] arrays
 * 4. Apply period-specific filters (time, professor, type, conflicts)
 * 5. Filter sections based on availability and user constraints
 * 6. Return filtered data suitable for schedule generation
 * 7. Coordinate with ConflictDetector for final validation
 * 
 * Filter Coordination:
 * 1. Extends FilterService filter registration system
 * 2. Adds schedule-specific filter implementations
 * 3. Coordinates with SearchService for text-based filtering
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
    private filterService: CourseFilterService;
    private registeredSectionFilters: Map<string, SectionFilter> = new Map();
    private registeredSelectedCourseFilters: Map<string, SelectedCourseFilter> = new Map();
    private courseSelectionFilter: CourseSelectionFilter;
    private periodDaysFilter: PeriodDaysFilter;
    private periodProfessorFilter: PeriodProfessorFilter;
    private periodTypeFilter: PeriodTypeFilter;
    private periodTermFilter: PeriodTermFilter;
    private periodAvailabilityFilter: PeriodAvailabilityFilter;
    private periodConflictFilter: PeriodConflictFilter | null = null;
    private sectionCodeFilter: SectionCodeFilter;
    private requiredStatusFilter: RequiredStatusFilter;
    private sectionStatusFilter: SectionStatusFilter;
    
    constructor(searchService: SearchService) {
        this.filterService = new CourseFilterService(searchService);
        this.courseSelectionFilter = new CourseSelectionFilter();
        this.periodDaysFilter = new PeriodDaysFilter();
        this.periodProfessorFilter = new PeriodProfessorFilter();
        this.periodTypeFilter = new PeriodTypeFilter();
        this.periodTermFilter = new PeriodTermFilter();
        this.periodAvailabilityFilter = new PeriodAvailabilityFilter();
        this.sectionCodeFilter = new SectionCodeFilter();
        this.requiredStatusFilter = new RequiredStatusFilter();
        this.sectionStatusFilter = new SectionStatusFilter();
        
        this.initializeFilters();
    }
    
    setConflictDetector(conflictDetector: ConflictDetector): void {
        this.periodConflictFilter = new PeriodConflictFilter(conflictDetector);
        this.registeredSectionFilters.set(this.periodConflictFilter.id, this.periodConflictFilter);
    }
    
    private initializeFilters(): void {
        // Register SearchTextFilter for course/professor search
        const searchTextFilter = new SearchTextFilter();
        this.filterService.registerFilter(searchTextFilter);
        
        // Register CourseFilter implementations with FilterService
        this.filterService.registerFilter(this.courseSelectionFilter);
        
        // Register SectionFilter implementations with our own registry
        this.registeredSectionFilters.set(this.periodDaysFilter.id, this.periodDaysFilter);
        this.registeredSectionFilters.set(this.periodProfessorFilter.id, this.periodProfessorFilter);
        this.registeredSectionFilters.set(this.periodTypeFilter.id, this.periodTypeFilter);
        this.registeredSectionFilters.set(this.periodTermFilter.id, this.periodTermFilter);
        this.registeredSectionFilters.set(this.periodAvailabilityFilter.id, this.periodAvailabilityFilter);
        this.registeredSectionFilters.set(this.sectionCodeFilter.id, this.sectionCodeFilter);
        
        // Register SelectedCourseFilter implementations with our own registry
        this.registeredSelectedCourseFilters.set(this.requiredStatusFilter.id, this.requiredStatusFilter);
        this.registeredSelectedCourseFilters.set(this.sectionStatusFilter.id, this.sectionStatusFilter);
    }
    
    // Delegate basic filter management to FilterService
    addFilter(filterId: string, criteria: any): boolean {
        return this.filterService.addFilter(filterId, criteria);
    }
    
    updateFilter(filterId: string, criteria: any): boolean {
        return this.filterService.updateFilter(filterId, criteria);
    }
    
    removeFilter(filterId: string): boolean {
        return this.filterService.removeFilter(filterId);
    }
    
    clearAllFilters(): void {
        this.filterService.clearFilters();
    }
    
    clearFilters(): void {
        this.filterService.clearFilters();
    }
    
    toggleFilter(filterId: string, criteria: any): boolean {
        return this.filterService.toggleFilter(filterId, criteria);
    }
    
    hasFilter(filterId: string): boolean {
        return this.filterService.hasFilter(filterId);
    }
    
    getActiveFilters() {
        return this.filterService.getActiveFilters();
    }
    
    getFilterCount(): number {
        return this.filterService.getFilterCount();
    }
    
    isEmpty(): boolean {
        return this.filterService.isEmpty();
    }
    
    addEventListener(listener: any): void {
        this.filterService.addEventListener(listener);
    }
    
    removeEventListener(listener: any): void {
        this.filterService.removeEventListener(listener);
    }
    
    saveFiltersToStorage(): void {
        // Use a different key for schedule filters
        const serialized = this.filterService['filterState'].serialize();
        localStorage.setItem('wpi-schedule-filters', serialized);
    }
    
    loadFiltersFromStorage(): boolean {
        const stored = localStorage.getItem('wpi-schedule-filters');
        if (stored) {
            return this.filterService['filterState'].deserialize(stored);
        }
        return false;
    }
    
    getFilterSummary(): string {
        return this.filterService.getFilterSummary();
    }
    
    // Main filtering method - now returns filtered periods with course context
    filterPeriods(selectedCourses: SelectedCourse[]): Array<{course: SelectedCourse, period: Period}> {
        if (this.isEmpty()) {
            return this.getAllPeriodsWithContext(selectedCourses);
        }
        
        const activeFilters = this.getActiveFilters();
        
        // First, filter courses by course selection filter
        let coursesToSearch = selectedCourses;
        const courseSelectionFilter = activeFilters.find(f => f.id === 'courseSelection');
        if (courseSelectionFilter) {
            coursesToSearch = this.courseSelectionFilter.applyToSelectedCourses(
                selectedCourses, 
                courseSelectionFilter.criteria
            );
        }
        
        // Get all periods from selected courses  
        let allPeriods = this.getAllPeriodsWithContext(coursesToSearch);
        
        // Apply period-based filters
        for (const activeFilter of activeFilters) {
            switch (activeFilter.id) {
                case 'searchText':
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
                    break;
                case 'periodDays':
                    // Exclude periods that are on excluded days
                    const excludedDaysForPeriods = new Set(activeFilter.criteria.days.map((day: string) => day.toLowerCase()));
                    allPeriods = allPeriods.filter(item => {
                        // Exclude period if it's on any of the excluded days
                        return !Array.from(item.period.days).some(day => 
                            excludedDaysForPeriods.has(day.toLowerCase())
                        );
                    });
                    break;
                case 'periodProfessor':
                    allPeriods = allPeriods.filter(item => 
                        this.periodProfessorFilter.applyToPeriods([item.period], activeFilter.criteria).length > 0
                    );
                    break;
                case 'periodType':
                    // Exclude periods that are of excluded types
                    const excludedTypesForPeriods = new Set(activeFilter.criteria.types.map((type: string) => this.periodTypeFilter.normalizeType(type)));
                    allPeriods = allPeriods.filter(item => {
                        // Exclude period if it's of any of the excluded types
                        const normalizedPeriodType = this.periodTypeFilter.normalizeType(item.period.type);
                        return !excludedTypesForPeriods.has(normalizedPeriodType);
                    });
                    break;
                case 'periodAvailability':
                    allPeriods = allPeriods.filter(item => 
                        this.periodAvailabilityFilter.applyToPeriods([item.period], activeFilter.criteria).length > 0
                    );
                    break;
                case 'periodConflict':
                    if (this.periodConflictFilter) {
                        // Convert periods to sections for section-based conflict checking
                        const sections = this.periodsToSections(allPeriods);
                        const validSections = this.periodConflictFilter.applyToSectionsWithContext(sections, {
                            ...activeFilter.criteria,
                            selectedCourses: selectedCourses
                        });
                        // Convert back to periods for consistent return type
                        allPeriods = this.sectionsToPeriodsWithContext(validSections);
                    }
                    break;
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
        
        // First, filter courses by course selection filter
        let coursesToSearch = selectedCourses;
        const courseSelectionFilter = activeFilters.find(f => f.id === 'courseSelection');
        if (courseSelectionFilter) {
            coursesToSearch = this.courseSelectionFilter.applyToSelectedCourses(
                selectedCourses, 
                courseSelectionFilter.criteria
            );
        }
        
        // Get all sections from selected courses  
        let allSections = this.getAllSectionsWithContext(coursesToSearch);
        
        // Apply section code filter
        const sectionCodeFilter = activeFilters.find(f => f.id === 'sectionCode');
        if (sectionCodeFilter) {
            allSections = this.applySectionCodeFilter(allSections, sectionCodeFilter.criteria.codes);
        }
        
        
        // Apply section-based filters using the registered SectionFilter implementations
        for (const activeFilter of activeFilters) {
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

        // Apply SelectedCourseFilter implementations
        for (const activeFilter of activeFilters) {
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
            case 'courseSelection':
                return selectedCourses.map(sc => ({
                    value: sc.course.id,
                    label: `${sc.course.department.abbreviation}${sc.course.number} - ${sc.course.name}`
                }));
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
    
    // Apply section code filtering
    private applySectionCodeFilter(sectionsWithContext: Array<{course: SelectedCourse, section: Section}>, codes: string[]): Array<{course: SelectedCourse, section: Section}> {
        if (!codes || codes.length === 0) {
            return sectionsWithContext;
        }
        
        const searchCodes = codes.map(code => code.toLowerCase().trim()).filter(code => code.length > 0);
        if (searchCodes.length === 0) {
            return sectionsWithContext;
        }
        
        return sectionsWithContext.filter(item => {
            const sectionNumber = item.section.number.toLowerCase();
            
            // Check if any of the search codes match this section
            return searchCodes.some(searchCode => {
                // Exact match
                if (sectionNumber === searchCode) {
                    return true;
                }
                
                // Partial match - section contains the search code
                if (sectionNumber.includes(searchCode)) {
                    return true;
                }
                
                // Pattern match for composite sections like "A01/AL01"
                const sectionParts = sectionNumber.split('/');
                return sectionParts.some(part => 
                    part.trim() === searchCode || part.trim().includes(searchCode)
                );
            });
        });
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