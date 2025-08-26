import { Course } from '../../types/types';
import { CourseFilter, ProfessorFilterCriteria } from '../../types/filters';

export class ProfessorFilter implements CourseFilter {
    readonly id = 'professor';
    readonly name = 'Professor';
    readonly description = 'Filter courses by instructor';
    readonly priority = 7;
    
    apply(courses: Course[], criteria: ProfessorFilterCriteria): Course[] {
        if (!criteria.professors || criteria.professors.length === 0) {
            return courses;
        }
        
        const professorSet = new Set(
            criteria.professors.map(prof => prof.toLowerCase())
        );
        
        return courses.filter(course =>
            course.sections.some(section =>
                section.periods.some(period =>
                    professorSet.has(period.professor.toLowerCase())
                )
            )
        );
    }
    
    isValidCriteria(criteria: any): criteria is ProfessorFilterCriteria {
        return criteria && 
               Array.isArray(criteria.professors) &&
               criteria.professors.every((prof: any) => typeof prof === 'string');
    }
    
    getDisplayValue(criteria: ProfessorFilterCriteria): string {
        if (criteria.professors.length === 1) {
            return `Professor: ${criteria.professors[0]}`;
        }
        if (criteria.professors.length <= 3) {
            return `Professors: ${criteria.professors.join(', ')}`;
        }
        return `Professors: ${criteria.professors.slice(0, 2).join(', ')}, +${criteria.professors.length - 2} more`;
    }
}