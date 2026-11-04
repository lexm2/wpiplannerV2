import {
  CreditRangeFilterCriteriaSchema,
  type CreditRangeFilterCriteria,
} from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';

export class CreditRangeFilter implements SectionBasedFilter {
  static readonly id = 'creditRange';
  static readonly criteria = CreditRangeFilterCriteriaSchema;
  readonly id = CreditRangeFilter.id;
  readonly criteria = CreditRangeFilter.criteria;
  readonly name = 'Credit Range';
  readonly description = 'Filter courses by credit hours';
  readonly priority = 99;

  apply(
    sections: FilterableSection[],
    criteria: CreditRangeFilterCriteria,
  ): FilterableSection[] {
    return sections.filter(fs => {
      const course = fs.course;
      return (
        course.maxCredits >= criteria.min && course.minCredits <= criteria.max
      );
    });
  }

  getDisplayValue(criteria: CreditRangeFilterCriteria): string {
    if (criteria.min === criteria.max) {
      return `${criteria.min} credit${criteria.min === 1 ? '' : 's'}`;
    }
    return `${criteria.min}-${criteria.max} credits`;
  }
}
