import { Course } from '../../types/types';
import { SelectedCourse } from '../../types/schedule';
import { CourseFilter } from '../../types/filters';

export interface SectionStatusFilterCriteria {
    status: 'selected' | 'unselected' | 'all';
}

export class SectionStatusFilter implements CourseFilter {
    readonly id = 'sectionStatus';
    readonly name = 'Section Status';
    readonly description = 'Filter courses by section selection status';
    
    apply(courses: Course[], criteria: SectionStatusFilterCriteria): Course[] {
        // This filter requires access to SelectedCourse data, so it will be handled
        // by the ScheduleFilterService rather than working on Course[] directly
        return courses;
    }
    
    applyToSelectedCourses(selectedCourses: SelectedCourse[], criteria: SectionStatusFilterCriteria): SelectedCourse[] {
        if (criteria.status === 'all') {
            return selectedCourses;
        }
        
        return selectedCourses.filter(sc => {
            const hasSelectedSection = sc.selectedSection !== null;
            
            if (criteria.status === 'selected') {
                return hasSelectedSection;
            } else if (criteria.status === 'unselected') {
                return !hasSelectedSection;
            }
            
            return true;
        });
    }
    
    isValidCriteria(criteria: any): criteria is SectionStatusFilterCriteria {
        return criteria && 
               typeof criteria === 'object' && 
               'status' in criteria && 
               ['selected', 'unselected', 'all'].includes(criteria.status);
    }
    
    getDisplayValue(criteria: SectionStatusFilterCriteria): string {
        switch (criteria.status) {
            case 'selected': return 'With Selected Section';
            case 'unselected': return 'Without Selected Section';
            case 'all': return 'All Courses';
            default: return 'Unknown Status';
        }
    }
}