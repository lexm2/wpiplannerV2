import { AvailabilityFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';

export class AvailabilityFilter implements SectionBasedFilter {
  readonly id = 'availability';
  readonly name = 'Availability';
  readonly description = 'Show only courses with available seats';
  readonly priority = 50;

  apply(
    sections: FilterableSection[],
    criteria: AvailabilityFilterCriteria,
    activeFilters?: Map<string, unknown>,
  ): FilterableSection[] {
    if (!criteria.availableOnly && !criteria.minAvailable) {
      return sections;
    }

    const termCriteria = activeFilters?.get('term') as
      { terms?: string[] } | undefined;
    const activeTerms = termCriteria?.terms
      ? new Set(termCriteria.terms.map((t: string) => t.toUpperCase()))
      : null;

    return sections.filter(fs => {
      if (activeTerms && !activeTerms.has(fs.section.computedTerm)) {
        return false;
      }

      if (criteria.availableOnly && fs.section.seatsAvailable <= 0) {
        return false;
      }

      if (
        criteria.minAvailable &&
        fs.section.seatsAvailable < criteria.minAvailable
      ) {
        return false;
      }

      return true;
    });
  }

  isValidCriteria(criteria: unknown): criteria is AvailabilityFilterCriteria {
    if (!criteria || typeof criteria !== 'object') return false;
    const c = criteria as Record<string, unknown>;
    if (typeof c.availableOnly !== 'boolean') {
      return false;
    }
    if (c.minAvailable !== undefined && typeof c.minAvailable !== 'number') {
      return false;
    }
    return true;
  }

  getDisplayValue(criteria: AvailabilityFilterCriteria): string {
    if (criteria.availableOnly && criteria.minAvailable) {
      return `Available seats (min ${criteria.minAvailable})`;
    }
    if (criteria.availableOnly) {
      return 'Available seats only';
    }
    if (criteria.minAvailable) {
      return `Min ${criteria.minAvailable} seats`;
    }
    return 'All courses';
  }
}
