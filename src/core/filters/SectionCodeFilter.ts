import { Course } from '../../types/types';
import { CourseFilter, SectionCodeFilterCriteria } from '../../types/filters';

export class SectionCodeFilter implements CourseFilter {
    readonly id = 'sectionCode';
    readonly name = 'Section Code';
    readonly description = 'Filter by section codes (AL01, AX01, A01, etc.)';

    apply(courses: Course[], criteria: SectionCodeFilterCriteria): Course[] {
        // This filter works at the section level, not course level
        // For course-level filtering, we just return all courses since section filtering
        // happens at the section level in the ScheduleFilterService
        return courses;
    }

    isValidCriteria(criteria: any): boolean {
        if (!criteria || typeof criteria !== 'object') {
            return false;
        }
        return Array.isArray(criteria.codes) && 
               criteria.codes.every((code: any) => typeof code === 'string');
    }

    getDisplayValue(criteria: SectionCodeFilterCriteria): string {
        if (!criteria.codes || criteria.codes.length === 0) {
            return 'No section codes';
        }
        
        if (criteria.codes.length === 1) {
            return `Section: ${criteria.codes[0]}`;
        }
        
        return `Sections: ${criteria.codes.join(', ')}`;
    }
}