import { TermFilterCriteria } from '../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../types/filterableUnit';
import { getDisplayTerms } from '../../utils/typeGuards';

export class TermFilter implements SectionBasedFilter {
    readonly id = 'term';
    readonly name = 'Term';
    readonly description = 'Filter courses by academic term';
    readonly priority = 25;

    apply(sections: FilterableSection[], criteria: TermFilterCriteria): FilterableSection[] {
        if (!criteria.terms || criteria.terms.length === 0) {
            return sections;
        }

        const termSet = new Set(
            criteria.terms.map(term => term.toUpperCase())
        );

        return sections.filter(fs => {
            // Map F→[A,B], S→[C,D] for graduate courses
            const displayTerms = getDisplayTerms(fs.section.computedTerm);
            return displayTerms.some(t => termSet.has(t));
        });
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