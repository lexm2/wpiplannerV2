import { Course, Period } from '../../types/types';
import { CourseFilter, PeriodTermFilterCriteria } from '../../types/filters';

export class PeriodTermFilter implements CourseFilter {
    readonly id = 'periodTerm';
    readonly name = 'Term';
    readonly description = 'Show sections from selected academic terms';
    
    apply(courses: Course[], criteria: PeriodTermFilterCriteria): Course[] {
        return courses;
    }
    
    applyToSections(sections: any[], criteria: PeriodTermFilterCriteria): any[] {
        if (!criteria.terms || criteria.terms.length === 0) {
            return sections;
        }
        
        const selectedTerms = new Set(
            criteria.terms.map(term => this.normalizeTerm(term))
        );
        
        return sections.filter(item => {
            const normalizedTerm = this.normalizeTerm(item.section.computedTerm);
            return selectedTerms.has(normalizedTerm);
        });
    }
    
    public normalizeTerm(term: string): string {
        if (!term) return '';
        return term.toUpperCase().trim();
    }
    
    isValidCriteria(criteria: any): criteria is PeriodTermFilterCriteria {
        return !!(criteria && 
                 typeof criteria === 'object' && 
                 'terms' in criteria && 
                 Array.isArray(criteria.terms) &&
                 criteria.terms.every((term: any) => typeof term === 'string'));
    }
    
    getDisplayValue(criteria: PeriodTermFilterCriteria): string {
        if (!criteria.terms || criteria.terms.length === 0) {
            return 'All terms';
        }
        
        if (criteria.terms.length === 1) {
            return `Term: ${this.formatTermName(criteria.terms[0])}`;
        }
        
        const termNames = criteria.terms.map(term => this.formatTermName(term));
        return `Terms: ${termNames.join(', ')}`;
    }
    
    private formatTermName(term: string): string {
        const normalized = this.normalizeTerm(term);
        
        const termMap: { [key: string]: string } = {
            'A': 'A Term',
            'B': 'B Term', 
            'C': 'C Term',
            'D': 'D Term'
        };
        
        return termMap[normalized] || term.toUpperCase();
    }
}