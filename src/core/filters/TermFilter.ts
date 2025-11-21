import { TermFilterCriteria } from '../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../types/filterableUnit';

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
            return termSet.has(fs.section.computedTerm.toUpperCase());
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