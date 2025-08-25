import { Course, Section } from '../../types/types';
import { CourseFilter, AvailabilityFilterCriteria, ActiveFilter } from '../../types/filters';
import { SelectedCourse } from '../../types/schedule';
import { ConflictDetector } from '../ConflictDetector';

export class AvailabilityFilter implements CourseFilter {
    readonly id = 'availability';
    readonly name = 'Availability';
    readonly description = 'Show only courses with at least one available section that matches other filters';
    private conflictDetector: ConflictDetector;

    constructor(conflictDetector: ConflictDetector) {
        this.conflictDetector = conflictDetector;
    }
    
    apply(courses: Course[], criteria: AvailabilityFilterCriteria, additionalData?: any): Course[] {
        if (!criteria.availableOnly) {
            return courses;
        }
        
        // Extract active terms, other filters, and selected courses from additional data
        const activeTerms = additionalData?.activeTerms || [];
        const otherActiveFilters = additionalData?.otherActiveFilters || [];
        const selectedCourses = additionalData?.selectedCourses || [];
        
        return courses.filter(course => {
            return course.sections.some(section => {
                // Section must have available seats
                if (section.seatsAvailable <= 0) {
                    return false;
                }
                
                // Section must match other active filters
                if (!this.sectionMatchesOtherFilters(section, activeTerms, otherActiveFilters)) {
                    return false;
                }
                
                // Section must not conflict with selected sections from other courses
                return !this.sectionConflictsWithSelected(section, selectedCourses, course.id);
            });
        });
    }
    
    private sectionMatchesOtherFilters(section: Section, activeTerms: string[], otherActiveFilters: ActiveFilter[]): boolean {
        // Check term filter
        if (activeTerms && activeTerms.length > 0) {
            const termSet = new Set(activeTerms.map(term => term.toUpperCase()));
            if (!termSet.has(section.computedTerm)) {
                return false;
            }
        }
        
        // Check other filters
        for (const filter of otherActiveFilters) {
            if (!this.sectionMatchesFilter(section, filter)) {
                return false;
            }
        }
        
        return true;
    }
    
    private sectionMatchesFilter(section: Section, filter: ActiveFilter): boolean {
        switch (filter.id) {
            case 'professor':
                return this.sectionMatchesProfessorFilter(section, filter.criteria);
            case 'term':
                // Term filter is handled separately above
                return true;
            case 'timeSlot':
                return this.sectionMatchesTimeSlotFilter(section, filter.criteria);
            default:
                // For unknown filters, assume they match (conservative approach)
                return true;
        }
    }
    
    private sectionMatchesProfessorFilter(section: Section, criteria: any): boolean {
        if (!criteria.professors || criteria.professors.length === 0) {
            return true;
        }
        
        const professorSet = new Set(criteria.professors.map((prof: string) => prof.toLowerCase()));
        return section.periods.some(period =>
            professorSet.has(period.professor.toLowerCase())
        );
    }
    
    private sectionMatchesTimeSlotFilter(section: Section, criteria: any): boolean {
        if (!criteria.timeSlots || criteria.timeSlots.length === 0) {
            return true;
        }
        
        return criteria.timeSlots.some((timeSlot: any) =>
            section.periods.some(period => {
                // Check time overlap
                const periodStart = period.startTime.hours * 60 + period.startTime.minutes;
                const periodEnd = period.endTime.hours * 60 + period.endTime.minutes;
                const slotStart = timeSlot.startTime.hours * 60 + timeSlot.startTime.minutes;
                const slotEnd = timeSlot.endTime.hours * 60 + timeSlot.endTime.minutes;
                
                const timeOverlaps = periodStart < slotEnd && slotStart < periodEnd;
                
                // Check day overlap
                const dayOverlaps = timeSlot.days.some((day: string) => period.days.has(day));
                
                return timeOverlaps && dayOverlaps;
            })
        );
    }
    
    private sectionConflictsWithSelected(
        section: Section, 
        selectedCourses: SelectedCourse[],
        currentCourseId: string
    ): boolean {
        // Get selected sections from OTHER courses only (exclude current course)
        const otherSelectedSections: Section[] = [];
        
        for (const selectedCourse of selectedCourses) {
            // Skip the current course to avoid self-conflicts
            if (selectedCourse.course.id === currentCourseId) {
                continue;
            }
            
            // Only consider courses with selected sections
            if (selectedCourse.selectedSectionNumber) {
                const selectedSection = selectedCourse.course.sections.find(s => 
                    s.number === selectedCourse.selectedSectionNumber
                );
                if (selectedSection) {
                    otherSelectedSections.push(selectedSection);
                }
            }
        }
        
        // If no other courses have selected sections, no conflicts possible
        if (otherSelectedSections.length === 0) {
            return false;
        }
        
        // Test if this section conflicts with any selected sections from other courses
        const testSections = [...otherSelectedSections, section];
        const conflicts = this.conflictDetector.detectConflicts(testSections);
        
        // Return true if conflicts found (section should be filtered out)
        return conflicts.length > 0;
    }
    
    isValidCriteria(criteria: any): criteria is AvailabilityFilterCriteria {
        return criteria && typeof criteria.availableOnly === 'boolean';
    }
    
    getDisplayValue(criteria: AvailabilityFilterCriteria): string {
        return criteria.availableOnly ? 'Available seats only' : 'All courses';
    }
}