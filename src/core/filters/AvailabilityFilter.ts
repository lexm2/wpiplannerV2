import { Course } from '../../types/types';
import { CourseFilter, AvailabilityFilterCriteria } from '../../types/filters';

export class AvailabilityFilter implements CourseFilter {
    readonly id = 'availability';
    readonly name = 'Availability';
    readonly description = 'Show only courses with available seats';
    
    apply(courses: Course[], criteria: AvailabilityFilterCriteria): Course[] {
        if (!criteria.availableOnly) {
            return courses;
        }
        
        return courses.filter(course => 
            course.sections.some(section => section.seatsAvailable > 0)
        );
    }
    
    isValidCriteria(criteria: any): criteria is AvailabilityFilterCriteria {
        return criteria && typeof criteria.availableOnly === 'boolean';
    }
    
    getDisplayValue(criteria: AvailabilityFilterCriteria): string {
        return criteria.availableOnly ? 'Available seats only' : 'All courses';
    }
}