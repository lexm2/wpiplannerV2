import type { InterestListFilterCriteria } from '../../../types/filters';
import type { FilterableSection } from '../../../types/filterableUnit';
import { SectionBasedFilter } from '../SectionFilterPipeline';

/**
 * Leaves out interest-list placeholders: sections with no times that
 * students join before the real sections open. WPI lists them as Online
 * with a waitlist, so without this a delivery-mode or seat filter matches
 * the placeholder and keeps a course none of whose real sections passed.
 * Runs first, so every other filter and every count sees only real sections.
 */
export class InterestListFilter implements SectionBasedFilter {
  readonly id = 'interestList';
  readonly name = 'Interest Lists';
  readonly description = 'Hide interest-list placeholder sections';
  readonly priority = 0;

  apply(
    sections: FilterableSection[],
    criteria: InterestListFilterCriteria,
  ): FilterableSection[] {
    if (criteria.includeInterestLists) return sections;
    return sections.filter(fs => !fs.section.isInterestList);
  }

  isValidCriteria(criteria: unknown): criteria is InterestListFilterCriteria {
    if (!criteria || typeof criteria !== 'object') return false;
    const { includeInterestLists } = criteria as Record<string, unknown>;
    return typeof includeInterestLists === 'boolean';
  }

  getDisplayValue(criteria: InterestListFilterCriteria): string {
    return criteria.includeInterestLists
      ? 'Interest lists shown'
      : 'Interest lists hidden';
  }
}
