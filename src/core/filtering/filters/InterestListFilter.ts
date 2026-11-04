import {
  InterestListFilterCriteriaSchema,
  type InterestListFilterCriteria,
} from '../../../types/filters';
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
  static readonly id = 'interestList';
  static readonly criteria = InterestListFilterCriteriaSchema;
  // The course API sets it from its own includeInterestLists flag.
  static readonly internal = true;
  readonly id = InterestListFilter.id;
  readonly criteria = InterestListFilter.criteria;
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

  getDisplayValue(criteria: InterestListFilterCriteria): string {
    return criteria.includeInterestLists
      ? 'Interest lists shown'
      : 'Interest lists hidden';
  }
}
