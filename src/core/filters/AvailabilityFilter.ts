import { Course } from '../../types/types';
import { CourseFilter, AvailabilityFilterCriteria } from '../../types/filters';

export class AvailabilityFilter implements CourseFilter {
    readonly id = 'availability';
    readonly name = 'Availability';
    readonly description = 'Show only courses with available seats in selected terms';
    
    apply(courses: Course[], criteria: AvailabilityFilterCriteria, activeTerms?: string[]): Course[] {
        if (!criteria.availableOnly) {
            return courses;
        }
        
        return courses.filter(course => {
            // If terms are specified, only consider sections in those terms
            if (activeTerms && activeTerms.length > 0) {
                const termSet = new Set(activeTerms.map(term => term.toUpperCase()));
                return course.sections.some(section => 
                    termSet.has(section.computedTerm) && section.seatsAvailable > 0
                );
            }
            
            // Fall back to original behavior: any section with available seats
            return course.sections.some(section => section.seatsAvailable > 0);
        });
    }
    
    isValidCriteria(criteria: any): criteria is AvailabilityFilterCriteria {
        return criteria && typeof criteria.availableOnly === 'boolean';
    }
    
    getDisplayValue(criteria: AvailabilityFilterCriteria): string {
        return criteria.availableOnly ? 'Available seats only' : 'All courses';
    }
}