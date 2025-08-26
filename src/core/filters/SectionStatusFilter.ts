import { SelectedCourse } from '../../types/schedule';
import { SelectedCourseFilter } from '../../types/filters';

export interface SectionStatusFilterCriteria {
    status: 'selected' | 'unselected' | 'all';
}

export class SectionStatusFilter implements SelectedCourseFilter {
    readonly id = 'sectionStatus';
    readonly name = 'Section Status';
    readonly description = 'Filter courses by section selection status';
    
    
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