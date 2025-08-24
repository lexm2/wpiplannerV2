import { Course } from '../../types/types';
import { SelectedCourse } from '../../types/schedule';
import { CourseFilter, CourseSelectionFilterCriteria } from '../../types/filters';

export class CourseSelectionFilter implements CourseFilter {
    readonly id = 'courseSelection';
    readonly name = 'Course Selection';
    readonly description = 'Select which courses to search periods within';
    
    apply(courses: Course[], criteria: CourseSelectionFilterCriteria): Course[] {
        // This filter is handled specially by the ScheduleFilterService
        return courses;
    }
    
    applyToSelectedCourses(selectedCourses: SelectedCourse[], criteria: CourseSelectionFilterCriteria): SelectedCourse[] {
        if (!criteria.selectedCourseIds || criteria.selectedCourseIds.length === 0) {
            return selectedCourses;
        }
        
        const selectedIds = new Set(criteria.selectedCourseIds);
        return selectedCourses.filter(sc => selectedIds.has(sc.course.id));
    }
    
    isValidCriteria(criteria: any): criteria is CourseSelectionFilterCriteria {
        return criteria && 
               typeof criteria === 'object' && 
               'selectedCourseIds' in criteria && 
               Array.isArray(criteria.selectedCourseIds) &&
               criteria.selectedCourseIds.every((id: any) => typeof id === 'string');
    }
    
    getDisplayValue(criteria: CourseSelectionFilterCriteria): string {
        const count = criteria.selectedCourseIds.length;
        if (count === 0) return 'All Courses';
        if (count === 1) return '1 Course Selected';
        return `${count} Courses Selected`;
    }
}