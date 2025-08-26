import { Course } from '../../types/types';
import { CourseFilter, CreditRangeFilterCriteria } from '../../types/filters';

export class CreditRangeFilter implements CourseFilter {
    readonly id = 'creditRange';
    readonly name = 'Credit Range';
    readonly description = 'Filter courses by credit hours';
    readonly priority = 45; // Medium priority - often eliminates some courses
    
    apply(courses: Course[], criteria: CreditRangeFilterCriteria): Course[] {
        return courses.filter(course => {
            // Course matches if its credit range overlaps with the filter range
            return course.maxCredits >= criteria.min && course.minCredits <= criteria.max;
        });
    }
    
    isValidCriteria(criteria: any): criteria is CreditRangeFilterCriteria {
        return criteria && 
               typeof criteria.min === 'number' &&
               typeof criteria.max === 'number' &&
               criteria.min >= 0 &&
               criteria.max >= criteria.min;
    }
    
    getDisplayValue(criteria: CreditRangeFilterCriteria): string {
        if (criteria.min === criteria.max) {
            return `${criteria.min} credit${criteria.min === 1 ? '' : 's'}`;
        }
        return `${criteria.min}-${criteria.max} credits`;
    }
}