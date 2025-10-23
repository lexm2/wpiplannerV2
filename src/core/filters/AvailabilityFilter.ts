import { Course } from '../../types/types';
import { CourseFilter, AvailabilityFilterCriteria } from '../../types/filters';

export class AvailabilityFilter implements CourseFilter {
    readonly id = 'availability';
    readonly name = 'Availability';
    readonly description = 'Show only courses with available seats';

    apply(courses: Course[], criteria: AvailabilityFilterCriteria, activeFilters?: Map<string, any>): Course[] {
        if (!criteria.availableOnly) {
            return courses;
        }

        // Check if term filter is active
        const termCriteria = activeFilters?.get('term');
        const activeTerms = termCriteria?.terms
            ? new Set(termCriteria.terms.map((t: string) => t.toUpperCase()))
            : null;

        return courses.filter(course =>
            course.sections.some(section => {
                // If term filter is active, only check availability in those specific terms
                if (activeTerms && !activeTerms.has(section.computedTerm)) {
                    return false;
                }
                return section.seatsAvailable > 0;
            })
        );
    }
    
    isValidCriteria(criteria: any): criteria is AvailabilityFilterCriteria {
        return criteria && typeof criteria.availableOnly === 'boolean';
    }
    
    getDisplayValue(criteria: AvailabilityFilterCriteria): string {
        return criteria.availableOnly ? 'Available seats only' : 'All courses';
    }
}