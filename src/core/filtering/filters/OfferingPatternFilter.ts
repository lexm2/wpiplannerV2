import {
  OfferingPatternFilterCriteriaSchema,
  type OfferingPatternFilterCriteria,
} from '../../../types/filters';
import type { FilterableSection } from '../../../types/filterableUnit';
import { SectionBasedFilter } from '../SectionFilterPipeline';

const LABELS = {
  1: 'every year',
  2: 'every other year',
  3: 'occasionally',
} as const;

/**
 * Courses by WPI's offering category: 1 (Cat. I) offered every year, 2 at
 * least every other year, 3 occasionally or on demand. The category is the
 * only published signal of what a later year will offer.
 */
export class OfferingPatternFilter implements SectionBasedFilter {
  static readonly id = 'offeringPattern';
  static readonly criteria = OfferingPatternFilterCriteriaSchema;
  readonly id = OfferingPatternFilter.id;
  readonly criteria = OfferingPatternFilter.criteria;
  readonly name = 'Offering Pattern';
  readonly description = 'Filter courses by how often WPI offers them';
  readonly priority = 23;

  apply(
    sections: FilterableSection[],
    criteria: OfferingPatternFilterCriteria,
  ): FilterableSection[] {
    const wanted = new Set<number>(criteria.categories);
    return sections.filter(fs => {
      const category = fs.course.category ?? null;
      return category === null
        ? (criteria.includeUnknown ?? false)
        : wanted.has(category);
    });
  }

  getDisplayValue(criteria: OfferingPatternFilterCriteria): string {
    const parts: string[] = criteria.categories.map(c => LABELS[c]);
    if (criteria.includeUnknown) parts.push('unknown');
    return `Offered ${parts.join(' or ')}`;
  }
}
