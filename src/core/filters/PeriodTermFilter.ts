import { Section } from '../../types/types';
import { SectionFilter, PeriodTermFilterCriteria } from '../../types/filters';
import { SelectedCourse } from '../../types/schedule';

export class PeriodTermFilter implements SectionFilter {
    readonly id = 'periodTerm';
    readonly name = 'Term';
    readonly description = 'Show sections from selected academic terms';
    
    applyToSections(sections: Section[], criteria: PeriodTermFilterCriteria): Section[] {
        if (!criteria.terms || criteria.terms.length === 0) {
            return sections;
        }
        
        const selectedTerms = new Set(
            criteria.terms.map(term => this.normalizeTerm(term))
        );
        
        return sections.filter(section => {
            const normalizedTerm = this.normalizeTerm(section.computedTerm);
            return selectedTerms.has(normalizedTerm);
        });
    }
    
    applyToSectionsWithContext(sectionsWithContext: Array<{course: SelectedCourse, section: Section}>, criteria: PeriodTermFilterCriteria): Array<{course: SelectedCourse, section: Section}> {
        if (!criteria.terms || criteria.terms.length === 0) {
            return sectionsWithContext;
        }
        
        const selectedTerms = new Set(
            criteria.terms.map(term => this.normalizeTerm(term))
        );
        
        return sectionsWithContext.filter(item => {
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