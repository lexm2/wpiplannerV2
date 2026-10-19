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
  ): FilterableSection[] {
    if (
      !criteria.availableOnly &&
      !criteria.minAvailable &&
      criteria.maxWaitlisted === undefined
    ) {
      return sections;
    }

    return sections.filter(fs => {
      if (criteria.availableOnly && fs.section.seatsAvailable <= 0) {
        return false;
      }

      if (
        criteria.minAvailable &&
        fs.section.seatsAvailable < criteria.minAvailable
      ) {
        return false;
      }

      if (
        criteria.maxWaitlisted !== undefined &&
        fs.section.actualWaitlist > criteria.maxWaitlisted
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
    if (c.maxWaitlisted !== undefined && typeof c.maxWaitlisted !== 'number') {
      return false;
    }
    return true;
  }

  getDisplayValue(criteria: AvailabilityFilterCriteria): string {
    const base = this.seatsDisplay(criteria);
    if (criteria.maxWaitlisted === undefined) return base;
    const waitlist = `Waitlist at most ${criteria.maxWaitlisted}`;
    return base === 'All courses' ? waitlist : `${base}, ${waitlist}`;
  }

  private seatsDisplay(criteria: AvailabilityFilterCriteria): string {
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
