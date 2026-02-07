import { Period, Section } from '../../types/types';
import { SelectedCourse } from '../../types/schedule';
import { PeriodDaysFilter } from '../../core/filtering/filters/PeriodDaysFilter';
import { PeriodProfessorFilter } from '../../core/filtering/filters/PeriodProfessorFilter';
import { PeriodTypeFilter } from '../../core/filtering/filters/PeriodTypeFilter';
import { PeriodTermFilter } from '../../core/filtering/filters/PeriodTermFilter';
import { PeriodAvailabilityFilter } from '../../core/filtering/filters/PeriodAvailabilityFilter';
import { ConflictFilter } from '../../core/filtering/filters/ConflictFilter';
import { SectionCodeFilter } from '../../core/filtering/filters/SectionCodeFilter';
import { ConflictDetector } from '../../core/scheduling/ConflictEngine';
import { SectionFilter, SelectedCourseFilter, FilterEventListener, BaseFilter, PeriodConflictFilterCriteria, ConflictFilterCriteria } from '../../types/filters';
import { SectionBasedFilter } from '../../core/filtering/SectionFilterPipeline';
import { FilterState } from '../../core/filtering/FilterState';
import { RequiredStatusFilter } from '../../core/filtering/filters/RequiredStatusFilter';
import { SectionStatusFilter } from '../../core/filtering/filters/SectionStatusFilter';
import { GraduateLevelFilter } from '../../core/filtering/filters/GraduateLevelFilter';
import { PeriodRMPRatingFilter } from '../../core/filtering/filters/PeriodRMPRatingFilter';
import { RateMyProfessorService } from '../external/RateMyProfessorService';
import { getAllSections } from '../../utils/courseUtils';
import { ScheduleSearchTextFilter } from '../../core/filtering/filters/ScheduleSearchTextFilter';
import { WakeUpTimeFilter } from '../../core/filtering/filters/WakeUpTimeFilter';

// Schedule-level filtering engine for course sections with time conflict detection and period-level constraints.

export class ScheduleFilterService {
    private filterState: FilterState;
    private registeredSectionFilters!: Map<string, SectionFilter>;
    private registeredSectionBasedFilters!: Map<string, SectionBasedFilter>;
    private registeredSelectedCourseFilters!: Map<string, SelectedCourseFilter>;
    private conflictFilter: ConflictFilter | null = null;
    private rmpService: RateMyProfessorService | null = null;

    constructor(rmpService?: RateMyProfessorService) {
        this.filterState = new FilterState();
        this.rmpService = rmpService || null;

        this.initializeFilters();
    }
    
    setConflictDetector(conflictDetector: ConflictDetector): void {
        this.conflictFilter = new ConflictFilter();
        this.registerSectionBasedFilter(this.conflictFilter);
    }
    
    private initializeFilters(): void {
        // Initialize filter registration Maps
        this.registeredSectionFilters = new Map();
        this.registeredSectionBasedFilters = new Map();
        this.registeredSelectedCourseFilters = new Map();

        // Register SectionFilter implementations using registration methods
        this.registerSectionFilter(new ScheduleSearchTextFilter());
        this.registerSectionFilter(new PeriodDaysFilter());
        this.registerSectionFilter(new PeriodProfessorFilter());
        this.registerSectionFilter(new PeriodTypeFilter());
        this.registerSectionFilter(new PeriodTermFilter());
        this.registerSectionFilter(new PeriodAvailabilityFilter());
        this.registerSectionFilter(new SectionCodeFilter());
        this.registerSectionFilter(new WakeUpTimeFilter());

        // Register RMP filter if service is available
        if (this.rmpService) {
            this.registerSectionFilter(new PeriodRMPRatingFilter(this.rmpService));
        }

        // Register SelectedCourseFilter implementations using registration methods
        this.registerSelectedCourseFilter(new RequiredStatusFilter());
        this.registerSelectedCourseFilter(new SectionStatusFilter());
        this.registerSelectedCourseFilter(new GraduateLevelFilter());
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

    // Section-Based Filter Registration
    registerSectionBasedFilter(filter: SectionBasedFilter): void {
        this.registeredSectionBasedFilters.set(filter.id, filter);
    }

    unregisterSectionBasedFilter(filterId: string): boolean {
        const removed = this.registeredSectionBasedFilters.delete(filterId);
        if (removed) {
            this.removeFilter(filterId);
        }
        return removed;
    }

    getSectionBasedFilter(filterId: string): SectionBasedFilter | undefined {
        return this.registeredSectionBasedFilters.get(filterId);
    }

    getAvailableSectionBasedFilters(): SectionBasedFilter[] {
        return Array.from(this.registeredSectionBasedFilters.values());
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
    private getAnyRegisteredFilter(filterId: string): BaseFilter | SectionBasedFilter | undefined {
        return this.registeredSectionFilters.get(filterId) ||
               this.registeredSectionBasedFilters.get(filterId) ||
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
                // SearchText filter works on sections, convert periods to sections, filter, then back
                const sections = this.periodsToSections(allPeriods);
                const searchFilter = this.registeredSectionFilters.get('searchText');
                if (searchFilter && (searchFilter as any).applyToSectionsWithContext) {
                    const filteredSections = (searchFilter as any).applyToSectionsWithContext(sections, activeFilter.criteria);
                    allPeriods = this.sectionsToPeriodsWithContext(filteredSections);
                }
            } else if (activeFilter.id === 'periodConflict' && this.conflictFilter) {
                // Special handling for conflict filter which needs section context
                const sections = this.periodsToSections(allPeriods);
                const conflictCriteria = activeFilter.criteria as PeriodConflictFilterCriteria;
                const validSections = this.conflictFilter.applyToSectionsWithContext(sections, {
                    ...conflictCriteria,
                    selectedCourses: selectedCourses
                });
                allPeriods = this.sectionsToPeriodsWithContext(validSections);
            } else {
                // Use registered filters with applyToPeriods method
                const sectionFilter = this.registeredSectionFilters.get(activeFilter.id);
                if (sectionFilter && (sectionFilter as any).applyToPeriods) {
                    const periods = allPeriods.map(item => item.period);
                    const filteredPeriods = (sectionFilter as any).applyToPeriods(periods, activeFilter.criteria);
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
            const sections = getAllSections(selectedCourse.course);
            for (const section of sections) {
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
            const sections = getAllSections(item.course.course);
            const section = sections.find(s => s.periods.includes(item.period));
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
            const sections = getAllSections(selectedCourse.course);
            for (const section of sections) {
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
            if (activeFilter.id === 'periodConflict' && this.conflictFilter) {
                // Special handling for conflict filter which needs additional context
                console.log('[ScheduleFilterService] Applying conflict filter');
                console.log('[ScheduleFilterService] Input sections:', allSections.length);
                console.log('[ScheduleFilterService] Selected courses for context:', selectedCourses.length);
                console.log('[ScheduleFilterService] Criteria:', activeFilter.criteria);

                const conflictCriteria = activeFilter.criteria as PeriodConflictFilterCriteria;
                allSections = this.conflictFilter.applyToSectionsWithContext(allSections, {
                    ...conflictCriteria,
                    selectedCourses: selectedCourses
                });

                console.log('[ScheduleFilterService] Output sections after conflict filter:', allSections.length);
            } else {
                const sectionFilter = this.registeredSectionFilters.get(activeFilter.id);
                if (sectionFilter && (sectionFilter as any).applyToSectionsWithContext) {
                    console.log(`[ScheduleFilterService] Applying section filter: ${activeFilter.id}`);
                    if (activeFilter.id === 'periodRmpRating') {
                        console.log('[ScheduleFilterService] ✓ Applying RMP filter with criteria:', activeFilter.criteria);
                    }
                    allSections = (sectionFilter as any).applyToSectionsWithContext(allSections, activeFilter.criteria);
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
                filteredSelectedCourses = (selectedCourseFilter as any).applyToSelectedCourses(
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
            const sections = getAllSections(sc.course);
            sections.forEach((section: Section) => {
                section.periods.forEach((period: Period) => {
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
            const sections = getAllSections(sc.course);
            sections.forEach((section: Section) => {
                section.periods.forEach((period: Period) => {
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
            const sections = getAllSections(sc.course);
            sections.forEach((section: Section) => {
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
        const terms = new Set<string>();

        selectedCourses.forEach(sc => {
            const sections = getAllSections(sc.course);
            sections.forEach((section: Section) => {
                // Add computed term (enum value)
                if (section.computedTerm) {
                    terms.add(section.computedTerm);
                }
            });
        });

        const termArray = Array.from(terms).sort();
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