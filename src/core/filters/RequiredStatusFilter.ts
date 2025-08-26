import { SelectedCourse } from '../../types/schedule';
import { SelectedCourseFilter } from '../../types/filters';

export interface RequiredStatusFilterCriteria {
    status: 'required' | 'optional' | 'all';
}

export class RequiredStatusFilter implements SelectedCourseFilter {
    readonly id = 'requiredStatus';
    readonly name = 'Required Status';
    readonly description = 'Filter courses by required/optional status';
    readonly priority = 85; // Low priority - final status-based filtering
    
    
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