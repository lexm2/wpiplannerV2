import type { OfferingPatternFilterCriteria } from '../../../types/filters';
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
  readonly id = 'offeringPattern';
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

  isValidCriteria(
    criteria: unknown,
  ): criteria is OfferingPatternFilterCriteria {
    if (!criteria || typeof criteria !== 'object') return false;
    const { categories, includeUnknown } = criteria as Record<string, unknown>;
    return (
      Array.isArray(categories) &&
      categories.every(c => c === 1 || c === 2 || c === 3) &&
      (includeUnknown === undefined || typeof includeUnknown === 'boolean')
    );
  }

  getDisplayValue(criteria: OfferingPatternFilterCriteria): string {
    const parts: string[] = criteria.categories.map(c => LABELS[c]);
    if (criteria.includeUnknown) parts.push('unknown');
    return `Offered ${parts.join(' or ')}`;
  }
}
