import { AvailabilityFilterCriteria } from '../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../types/filterableUnit';

export class AvailabilityFilter implements SectionBasedFilter {
    readonly id = 'availability';
    readonly name = 'Availability';
    readonly description = 'Show only courses with available seats';
    readonly priority = 50;

    apply(sections: FilterableSection[], criteria: AvailabilityFilterCriteria, activeFilters?: Map<string, any>): FilterableSection[] {
        if (!criteria.availableOnly) {
            return sections;
        }

        const termCriteria = activeFilters?.get('term');
        const activeTerms = termCriteria?.terms
            ? new Set(termCriteria.terms.map((t: string) => t.toUpperCase()))
            : null;

        return sections.filter(fs => {
            if (activeTerms && !activeTerms.has(fs.section.computedTerm)) {
                return false;
            }
            return fs.section.seatsAvailable > 0;
        });
    }
    
    isValidCriteria(criteria: any): criteria is AvailabilityFilterCriteria {
        return criteria && typeof criteria.availableOnly === 'boolean';
    }
    
    getDisplayValue(criteria: AvailabilityFilterCriteria): string {
        return criteria.availableOnly ? 'Available seats only' : 'All courses';
    }
}