import {
  TermFilterCriteriaSchema,
  type TermFilterCriteria,
} from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';

export class TermFilter implements SectionBasedFilter {
  static readonly id = 'term';
  static readonly criteria = TermFilterCriteriaSchema;
  readonly id = TermFilter.id;
  readonly criteria = TermFilter.criteria;
  readonly name = 'Term';
  readonly description = 'Filter courses by academic term';
  readonly priority = 25;

  apply(
    sections: FilterableSection[],
    criteria: TermFilterCriteria,
  ): FilterableSection[] {
    if (!criteria.terms || criteria.terms.length === 0) {
      return sections;
    }

    const termSet = new Set(criteria.terms.map(term => term.toUpperCase()));

    return sections.filter(fs => {
      return termSet.has(fs.section.computedTerm.toUpperCase());
    });
  }

  getDisplayValue(criteria: TermFilterCriteria): string {
    if (criteria.terms.length === 1) {
      return `Term: ${criteria.terms[0]}`;
    }
    return `Terms: ${criteria.terms.join(', ')}`;
  }
}
