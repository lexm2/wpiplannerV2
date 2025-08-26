import { Period, Section } from '../../types/types';
import { SectionFilter, PeriodProfessorFilterCriteria } from '../../types/filters';
import { SelectedCourse } from '../../types/schedule';

export class PeriodProfessorFilter implements SectionFilter {
    readonly id = 'periodProfessor';
    readonly name = 'Period Professor';
    readonly description = 'Filter periods by professor';
    
    applyToSections(sections: Section[], criteria: PeriodProfessorFilterCriteria): Section[] {
        if (!criteria.professors || criteria.professors.length === 0) {
            return sections;
        }
        
        const selectedProfessors = new Set(
            criteria.professors.map(prof => prof.toLowerCase().trim())
        );
        
        return sections.filter(section => {
            // Include section if ANY period has one of the selected professors
            return section.periods.some(period => {
                if (!period.professor) return false;
                
                const professorName = period.professor.toLowerCase().trim();
                return selectedProfessors.has(professorName) ||
                       // Also check partial matches
                       Array.from(selectedProfessors).some(selected => 
                           professorName.includes(selected) || selected.includes(professorName)
                       );
            });
        });
    }

    applyToSectionsWithContext(sectionsWithContext: Array<{course: SelectedCourse, section: Section}>, criteria: PeriodProfessorFilterCriteria): Array<{course: SelectedCourse, section: Section}> {
        if (!criteria.professors || criteria.professors.length === 0) {
            return sectionsWithContext;
        }
        
        const selectedProfessors = new Set(
            criteria.professors.map(prof => prof.toLowerCase().trim())
        );
        
        return sectionsWithContext.filter(item => {
            // Include section if ANY period has one of the selected professors
            return item.section.periods.some(period => {
                if (!period.professor) return false;
                
                const professorName = period.professor.toLowerCase().trim();
                return selectedProfessors.has(professorName) ||
                       // Also check partial matches
                       Array.from(selectedProfessors).some(selected => 
                           professorName.includes(selected) || selected.includes(professorName)
                       );
            });
        });
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