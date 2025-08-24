import { Course, Period } from '../types/types';
import { SelectedCourse } from '../types/schedule';
import { FilterService } from './FilterService';
import { SearchService } from './searchService';
import { CourseSelectionFilter } from '../core/filters/CourseSelectionFilter';
import { PeriodTimeFilter } from '../core/filters/PeriodTimeFilter';
import { PeriodDaysFilter } from '../core/filters/PeriodDaysFilter';
import { PeriodProfessorFilter } from '../core/filters/PeriodProfessorFilter';
import { PeriodTypeFilter } from '../core/filters/PeriodTypeFilter';
import { PeriodLocationFilter } from '../core/filters/PeriodLocationFilter';
import { PeriodAvailabilityFilter } from '../core/filters/PeriodAvailabilityFilter';
import { SearchTextFilter } from '../core/filters';

export class ScheduleFilterService {
    private filterService: FilterService;
    private courseSelectionFilter: CourseSelectionFilter;
    private periodTimeFilter: PeriodTimeFilter;
    private periodDaysFilter: PeriodDaysFilter;
    private periodProfessorFilter: PeriodProfessorFilter;
    private periodTypeFilter: PeriodTypeFilter;
    private periodLocationFilter: PeriodLocationFilter;
    private periodAvailabilityFilter: PeriodAvailabilityFilter;
    
    constructor(searchService: SearchService) {
        this.filterService = new FilterService(searchService);
        this.courseSelectionFilter = new CourseSelectionFilter();
        this.periodTimeFilter = new PeriodTimeFilter();
        this.periodDaysFilter = new PeriodDaysFilter();
        this.periodProfessorFilter = new PeriodProfessorFilter();
        this.periodTypeFilter = new PeriodTypeFilter();
        this.periodLocationFilter = new PeriodLocationFilter();
        this.periodAvailabilityFilter = new PeriodAvailabilityFilter();
        
        this.initializeFilters();
    }
    
    private initializeFilters(): void {
        // Register SearchTextFilter for course/professor search
        const searchTextFilter = new SearchTextFilter();
        this.filterService.registerFilter(searchTextFilter);
        
        // Register period-based filters
        this.filterService.registerFilter(this.courseSelectionFilter);
        this.filterService.registerFilter(this.periodTimeFilter);
        this.filterService.registerFilter(this.periodDaysFilter);
        this.filterService.registerFilter(this.periodProfessorFilter);
        this.filterService.registerFilter(this.periodTypeFilter);
        this.filterService.registerFilter(this.periodLocationFilter);
        this.filterService.registerFilter(this.periodAvailabilityFilter);
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
                case 'periodTime':
                    allPeriods = allPeriods.filter(item => 
                        this.periodTimeFilter.applyToPeriods([item.period], activeFilter.criteria).length > 0
                    );
                    break;
                case 'periodDays':
                    allPeriods = allPeriods.filter(item => 
                        this.periodDaysFilter.applyToPeriods([item.period], activeFilter.criteria).length > 0
                    );
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
                case 'periodLocation':
                    allPeriods = allPeriods.filter(item => 
                        this.periodLocationFilter.applyToPeriods([item.period], activeFilter.criteria).length > 0
                    );
                    break;
                case 'periodAvailability':
                    allPeriods = allPeriods.filter(item => 
                        this.periodAvailabilityFilter.applyToPeriods([item.period], activeFilter.criteria).length > 0
                    );
                    break;
            }
        }
        
        return allPeriods;
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
            case 'periodLocation':
                return this.getAvailableLocations(selectedCourses);
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
    
    private getAvailableLocations(selectedCourses: SelectedCourse[]): { buildings: { value: string; label: string }[]; rooms: { value: string; label: string }[] } {
        const buildings = new Set<string>();
        const rooms = new Set<string>();
        
        selectedCourses.forEach(sc => {
            sc.course.sections.forEach(section => {
                section.periods.forEach(period => {
                    if (period.building && period.building.trim()) {
                        buildings.add(period.building.trim());
                    }
                    if (period.room && period.room.trim()) {
                        rooms.add(period.room.trim());
                    }
                });
            });
        });
        
        return {
            buildings: Array.from(buildings).sort().map(building => ({
                value: building,
                label: building
            })),
            rooms: Array.from(rooms).sort().map(room => ({
                value: room,
                label: room
            }))
        };
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
}