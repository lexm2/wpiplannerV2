import { CreditRangeFilterCriteria } from '../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../types/filterableUnit';

export class CreditRangeFilter implements SectionBasedFilter {
    readonly id = 'creditRange';
    readonly name = 'Credit Range';
    readonly description = 'Filter courses by credit hours';
    readonly priority = 99;

    apply(sections: FilterableSection[], criteria: CreditRangeFilterCriteria): FilterableSection[] {
        return sections.filter(fs => {
            const course = fs.course;
            return course.maxCredits >= criteria.min && course.minCredits <= criteria.max;
        });
    }
    
    isValidCriteria(criteria: any): criteria is CreditRangeFilterCriteria {
        return criteria && 
               typeof criteria.min === 'number' &&
               typeof criteria.max === 'number' &&
               criteria.min >= 0 &&
               criteria.max >= criteria.min;
    }
    
    getDisplayValue(criteria: CreditRangeFilterCriteria): string {
        if (criteria.min === criteria.max) {
            return `${criteria.min} credit${criteria.min === 1 ? '' : 's'}`;
        }
        return `${criteria.min}-${criteria.max} credits`;
    }
}