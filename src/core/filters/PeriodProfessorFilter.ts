import { Course, Period } from '../../types/types';
import { CourseFilter, PeriodProfessorFilterCriteria } from '../../types/filters';

export class PeriodProfessorFilter implements CourseFilter {
    readonly id = 'periodProfessor';
    readonly name = 'Period Professor';
    readonly description = 'Filter periods by professor';
    
    apply(courses: Course[], criteria: PeriodProfessorFilterCriteria): Course[] {
        // This filter works on periods, so it's handled by the service layer
        return courses;
    }
    
    applyToPeriods(periods: Period[], criteria: PeriodProfessorFilterCriteria): Period[] {
        if (!criteria.professors || criteria.professors.length === 0) {
            return periods;
        }
        
        const selectedProfessors = new Set(
            criteria.professors.map(prof => prof.toLowerCase().trim())
        );
        
        return periods.filter(period => {
            if (!period.professor) return false;
            
            const professorName = period.professor.toLowerCase().trim();
            return selectedProfessors.has(professorName) ||
                   // Also check partial matches
                   Array.from(selectedProfessors).some(selected => 
                       professorName.includes(selected) || selected.includes(professorName)
                   );
        });
    }
    
    isValidCriteria(criteria: any): criteria is PeriodProfessorFilterCriteria {
        return criteria && 
               typeof criteria === 'object' && 
               'professors' in criteria && 
               Array.isArray(criteria.professors) &&
               criteria.professors.every((prof: any) => typeof prof === 'string');
    }
    
    getDisplayValue(criteria: PeriodProfessorFilterCriteria): string {
        if (!criteria.professors || criteria.professors.length === 0) {
            return 'Any Professor';
        }
        
        if (criteria.professors.length === 1) {
            return criteria.professors[0];
        }
        
        return `${criteria.professors.length} Professors`;
    }
}