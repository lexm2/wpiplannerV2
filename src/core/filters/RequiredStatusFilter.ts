import { Course } from '../../types/types';
import { SelectedCourse } from '../../types/schedule';
import { CourseFilter } from '../../types/filters';

export interface RequiredStatusFilterCriteria {
    status: 'required' | 'optional' | 'all';
}

export class RequiredStatusFilter implements CourseFilter {
    readonly id = 'requiredStatus';
    readonly name = 'Required Status';
    readonly description = 'Filter courses by required/optional status';
    
    apply(courses: Course[], criteria: RequiredStatusFilterCriteria): Course[] {
        // This filter requires access to SelectedCourse data, so it will be handled
        // by the ScheduleFilterService rather than working on Course[] directly
        return courses;
    }
    
    applyToSelectedCourses(selectedCourses: SelectedCourse[], criteria: RequiredStatusFilterCriteria): SelectedCourse[] {
        if (criteria.status === 'all') {
            return selectedCourses;
        }
        
        return selectedCourses.filter(sc => {
            if (criteria.status === 'required') {
                return sc.isRequired;
            } else if (criteria.status === 'optional') {
                return !sc.isRequired;
            }
            
            return true;
        });
    }
    
    isValidCriteria(criteria: any): criteria is RequiredStatusFilterCriteria {
        return criteria && 
               typeof criteria === 'object' && 
               'status' in criteria && 
               ['required', 'optional', 'all'].includes(criteria.status);
    }
    
    getDisplayValue(criteria: RequiredStatusFilterCriteria): string {
        switch (criteria.status) {
            case 'required': return 'Required Courses';
            case 'optional': return 'Optional Courses';
            case 'all': return 'All Courses';
            default: return 'Unknown Status';
        }
    }
}