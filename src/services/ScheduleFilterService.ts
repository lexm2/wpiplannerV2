import { Course, Period } from '../types/types';
import { SelectedCourse } from '../types/schedule';
import { FilterService } from './FilterService';
import { SearchService } from './searchService';
import { CourseSelectionFilter } from '../core/filters/CourseSelectionFilter';
import { PeriodDaysFilter } from '../core/filters/PeriodDaysFilter';
import { PeriodProfessorFilter } from '../core/filters/PeriodProfessorFilter';
import { PeriodTypeFilter } from '../core/filters/PeriodTypeFilter';
import { PeriodAvailabilityFilter } from '../core/filters/PeriodAvailabilityFilter';
import { PeriodConflictFilter } from '../core/filters/PeriodConflictFilter';
import { SectionCodeFilter } from '../core/filters/SectionCodeFilter';
import { SearchTextFilter } from '../core/filters';
import { ConflictDetector } from '../core/ConflictDetector';

export class ScheduleFilterService {
    private filterService: FilterService;
    private courseSelectionFilter: CourseSelectionFilter;
    private periodDaysFilter: PeriodDaysFilter;
    private periodProfessorFilter: PeriodProfessorFilter;
    private periodTypeFilter: PeriodTypeFilter;
    private periodAvailabilityFilter: PeriodAvailabilityFilter;
    private periodConflictFilter: PeriodConflictFilter | null = null;
    private sectionCodeFilter: SectionCodeFilter;
    
    constructor(searchService: SearchService) {
        this.filterService = new FilterService(searchService);
        this.courseSelectionFilter = new CourseSelectionFilter();
        this.periodDaysFilter = new PeriodDaysFilter();
        this.periodProfessorFilter = new PeriodProfessorFilter();
        this.periodTypeFilter = new PeriodTypeFilter();
        this.periodAvailabilityFilter = new PeriodAvailabilityFilter();
        this.sectionCodeFilter = new SectionCodeFilter();
        
        this.initializeFilters();
    }
    
    setConflictDetector(conflictDetector: ConflictDetector): void {
        this.periodConflictFilter = new PeriodConflictFilter(conflictDetector);
        this.filterService.registerFilter(this.periodConflictFilter);
    }
    
    private initializeFilters(): void {
        // Register SearchTextFilter for course/professor search
        const searchTextFilter = new SearchTextFilter();
        this.filterService.registerFilter(searchTextFilter);
        
        // Register period-based filters
        this.filterService.registerFilter(this.courseSelectionFilter);
        this.filterService.registerFilter(this.periodDaysFilter);
        this.filterService.registerFilter(this.periodProfessorFilter);
        this.filterService.registerFilter(this.periodTypeFilter);
        this.filterService.registerFilter(this.periodAvailabilityFilter);
        this.filterService.registerFilter(this.sectionCodeFilter);
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
        
        // Apply search text filter to periods (search course name, professor, etc.)
        const searchTextFilter = activeFilters.find(f => f.id === 'searchText');
        if (searchTextFilter) {
            allPeriods = this.applySearchTextToPeriods(allPeriods, searchTextFilter.criteria.query);
        }
        
        // Apply period-based filters
        for (const activeFilter of activeFilters) {
            switch (activeFilter.id) {
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
                    allPeriods = allPeriods.filter(item => 
                        this.periodTypeFilter.applyToPeriods([item.period], activeFilter.criteria).length > 0
                    );
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
    
    // Apply search text to periods
    private applySearchTextToPeriods(periodsWithContext: Array<{course: SelectedCourse, period: Period}>, query: string): Array<{course: SelectedCourse, period: Period}> {
        if (!query || !query.trim()) {
            return periodsWithContext;
        }
        
        const searchQuery = query.toLowerCase().trim();
        
        return periodsWithContext.filter(item => {
            const course = item.course.course;
            const period = item.period;
            
            // Search in course info
            if (course.name.toLowerCase().includes(searchQuery) ||
                course.number.toLowerCase().includes(searchQuery) ||
                course.department.abbreviation.toLowerCase().includes(searchQuery)) {
                return true;
            }
            
            // Search in period info  
            if (period.professor.toLowerCase().includes(searchQuery) ||
                period.type.toLowerCase().includes(searchQuery) ||
                period.building.toLowerCase().includes(searchQuery) ||
                period.room.toLowerCase().includes(searchQuery) ||
                period.location.toLowerCase().includes(searchQuery)) {
                return true;
            }
            
            return false;
        });
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
        
        // Apply search text filter to sections (search course name, professor, etc.)
        const searchTextFilter = activeFilters.find(f => f.id === 'searchText');
        if (searchTextFilter) {
            allSections = this.applySearchTextToSections(allSections, searchTextFilter.criteria.query);
        }
        
        // Apply section-based filters
        for (const activeFilter of activeFilters) {
            switch (activeFilter.id) {
                case 'periodDays':
                    // Exclude entire sections if ANY period is on excluded days
                    const excludedDaysForSections = new Set(activeFilter.criteria.days.map((day: string) => day.toLowerCase()));
                    allSections = allSections.filter(item => {
                        // Exclude section if ANY period is on any of the excluded days
                        return !item.section.periods.some(period => 
                            Array.from(period.days).some(day => 
                                excludedDaysForSections.has(day.toLowerCase())
                            )
                        );
                    });
                    break;
                case 'periodProfessor':
                    allSections = allSections.filter(item => 
                        this.periodProfessorFilter.applyToPeriods(item.section.periods, activeFilter.criteria).length > 0
                    );
                    break;
                case 'periodType':
                    allSections = allSections.filter(item => 
                        this.periodTypeFilter.applyToPeriods(item.section.periods, activeFilter.criteria).length > 0
                    );
                    break;
                case 'periodAvailability':
                    allSections = allSections.filter(item => 
                        this.periodAvailabilityFilter.applyToPeriods(item.section.periods, activeFilter.criteria).length > 0
                    );
                    break;
                case 'periodConflict':
                    if (this.periodConflictFilter) {
                        allSections = this.periodConflictFilter.applyToSectionsWithContext(allSections, {
                            ...activeFilter.criteria,
                            selectedCourses: selectedCourses
                        });
                    }
                    break;
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
            case 'sectionCode':
                return this.getAvailableSectionCodes(selectedCourses);
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
    
    // Apply search text to sections
    private applySearchTextToSections(sectionsWithContext: Array<{course: SelectedCourse, section: Section}>, query: string): Array<{course: SelectedCourse, section: Section}> {
        if (!query || !query.trim()) {
            return sectionsWithContext;
        }
        
        const searchQuery = query.toLowerCase().trim();
        
        return sectionsWithContext.filter(item => {
            const course = item.course.course;
            const section = item.section;
            
            // Search in course info
            if (course.name.toLowerCase().includes(searchQuery) ||
                course.number.toLowerCase().includes(searchQuery) ||
                course.department.abbreviation.toLowerCase().includes(searchQuery)) {
                return true;
            }
            
            // Search in section number
            if (section.number.toLowerCase().includes(searchQuery)) {
                return true;
            }
            
            // Search in any period info within the section
            return section.periods.some(period =>
                period.professor.toLowerCase().includes(searchQuery) ||
                period.type.toLowerCase().includes(searchQuery) ||
                period.building.toLowerCase().includes(searchQuery) ||
                period.room.toLowerCase().includes(searchQuery) ||
                period.location.toLowerCase().includes(searchQuery)
            );
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
}