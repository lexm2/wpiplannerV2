import { CreditRangeFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';

export class CreditRangeFilter implements SectionBasedFilter {
  readonly id = 'creditRange';
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

  isValidCriteria(criteria: unknown): criteria is CreditRangeFilterCriteria {
    if (!criteria || typeof criteria !== 'object') return false;
    const c = criteria as Record<string, unknown>;
    return (
      typeof c.min === 'number' &&
      typeof c.max === 'number' &&
      c.min >= 0 &&
      c.max >= c.min
    );
  }

  getDisplayValue(criteria: CreditRangeFilterCriteria): string {
    if (criteria.min === criteria.max) {
      return `${criteria.min} credit${criteria.min === 1 ? '' : 's'}`;
    }
    return `${criteria.min}-${criteria.max} credits`;
  }
}
