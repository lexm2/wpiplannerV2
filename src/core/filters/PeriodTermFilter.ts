import { Section } from '../../types/types';
import { SectionFilter, PeriodTermFilterCriteria } from '../../types/filters';
import { SelectedCourse } from '../../types/schedule';
import { getDisplayTerms } from '../../utils/typeGuards';

export class PeriodTermFilter implements SectionFilter {
    readonly id = 'periodTerm';
    readonly name = 'Term';
    readonly description = 'Show sections from selected academic terms';
    readonly priority = 24;

    apply(sections: any[], criteria: any, _activeFilters?: Map<string, any>): any[] {
        return this.applyToSections(sections, criteria);
    }

    applyToSections(sections: Section[], criteria: PeriodTermFilterCriteria): Section[] {
        if (!criteria.terms || criteria.terms.length === 0) {
            return sections;
        }
        
        const selectedTerms = new Set(
            criteria.terms.map(term => this.normalizeTerm(term))
        );
        
        return sections.filter(section => {
            // Map F→[A,B], S→[C,D] for graduate courses
            const displayTerms = getDisplayTerms(section.computedTerm);
            return displayTerms.some(t => selectedTerms.has(this.normalizeTerm(t)));
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
            // Map F→[A,B], S→[C,D] for graduate courses
            const displayTerms = getDisplayTerms(item.section.computedTerm);
            return displayTerms.some(t => selectedTerms.has(this.normalizeTerm(t)));
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