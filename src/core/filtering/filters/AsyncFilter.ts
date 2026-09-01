import type { AsyncFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';
import { isAsyncSection } from '../../../utils/timeWindows';

/**
 * Hides sections with no scheduled meeting time. Only the hiding state is
 * stored: including async sections is the absence of the filter.
 */
export class AsyncFilter implements SectionBasedFilter {
  readonly id = 'async';
  readonly name = 'Async Classes';
  readonly description =
    'Include or hide sections with no scheduled meeting time';
  readonly priority = 16;

  apply(
    sections: FilterableSection[],
    criteria: AsyncFilterCriteria,
  ): FilterableSection[] {
    if (criteria?.include !== false) return sections;
    return sections.filter(fs => !isAsyncSection(fs.section));
  }

  isValidCriteria(criteria: unknown): criteria is AsyncFilterCriteria {
    if (!criteria || typeof criteria !== 'object') return false;
    return typeof (criteria as Record<string, unknown>).include === 'boolean';
  }

  getDisplayValue(criteria: AsyncFilterCriteria): string {
    return criteria?.include === false
      ? 'Hide async classes'
      : 'Include async classes';
  }
}
