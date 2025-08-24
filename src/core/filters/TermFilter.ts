import { Course } from '../../types/types';
import { CourseFilter, TermFilterCriteria } from '../../types/filters';

export class TermFilter implements CourseFilter {
    readonly id = 'term';
    readonly name = 'Term';
    readonly description = 'Filter courses by academic term';
    
    apply(courses: Course[], criteria: TermFilterCriteria): Course[] {
        if (!criteria.terms || criteria.terms.length === 0) {
            return courses;
        }
        
        const termSet = new Set(
            criteria.terms.map(term => term.toLowerCase())
        );
        
        return courses.filter(course =>
            course.sections.some(section =>
                section.term && termSet.has(section.term.toLowerCase())
            )
        );
    }
    
    isValidCriteria(criteria: any): criteria is TermFilterCriteria {
        return criteria && 
               Array.isArray(criteria.terms) &&
               criteria.terms.every((term: any) => typeof term === 'string');
    }
    
    getDisplayValue(criteria: TermFilterCriteria): string {
        if (criteria.terms.length === 1) {
            return `Term: ${criteria.terms[0]}`;
        }
        return `Terms: ${criteria.terms.join(', ')}`;
    }
}