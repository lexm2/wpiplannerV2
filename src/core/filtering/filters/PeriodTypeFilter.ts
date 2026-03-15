import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';

interface PeriodTypeFilterCriteria {
    types: string[];
}

export class PeriodTypeFilter implements SectionBasedFilter {
    readonly id = 'periodType';
    readonly name = 'Period Type';
    readonly description = 'Exclude sections with the specified period types';
    readonly priority = 22;

    apply(sections: FilterableSection[], criteria: PeriodTypeFilterCriteria): FilterableSection[] {
        if (!criteria.types || criteria.types.length === 0) {
            return sections;
        }

        const excludedTypes = criteria.types.map(t => t.toLowerCase());

        return sections.filter(fs =>
            !fs.section.periods.some(period =>
                excludedTypes.some(excluded =>
                    period.type.toLowerCase().startsWith(excluded) ||
                    excluded.startsWith(period.type.toLowerCase())
                )
            )
        );
    }

    isValidCriteria(criteria: unknown): criteria is PeriodTypeFilterCriteria {
        return !!(
            criteria &&
            typeof criteria === 'object' &&
            'types' in criteria &&
            Array.isArray((criteria as PeriodTypeFilterCriteria).types) &&
            (criteria as PeriodTypeFilterCriteria).types.every((t: unknown) => typeof t === 'string')
        );
    }

    getDisplayValue(criteria: PeriodTypeFilterCriteria): string {
        if (!criteria.types || criteria.types.length === 0) {
            return 'No exclusions';
        }
        return `Exclude types: ${criteria.types.join(', ')}`;
    }
}
