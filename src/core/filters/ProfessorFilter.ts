import { ProfessorFilterCriteria } from '../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../types/filterableUnit';

export class ProfessorFilter implements SectionBasedFilter {
    readonly id = 'professor';
    readonly name = 'Professor';
    readonly description = 'Filter courses by instructor';
    readonly priority = 7;

    apply(sections: FilterableSection[], criteria: ProfessorFilterCriteria): FilterableSection[] {
        if (!criteria.professors || criteria.professors.length === 0) {
            return sections;
        }

        const professorSet = new Set(
            criteria.professors.map(prof => prof.toLowerCase())
        );

        return sections.filter(fs =>
            fs.section.periods.some(period =>
                professorSet.has(period.professor.toLowerCase())
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