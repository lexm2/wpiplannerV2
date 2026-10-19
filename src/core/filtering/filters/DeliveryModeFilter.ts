import type { DeliveryModeFilterCriteria } from '../../../types/filters';
import type { FilterableSection } from '../../../types/filterableUnit';
import { SectionBasedFilter } from '../SectionFilterPipeline';

/**
 * Sections taught in any of the given modes ("In-Person", "Online",
 * "Hybrid"), case-insensitively. Per section, like term: a lecture's labs
 * must pass too. Asynchronous meetings are a property of a period, not a
 * mode; an Online section may still meet at set times.
 */
export class DeliveryModeFilter implements SectionBasedFilter {
  readonly id = 'deliveryMode';
  readonly name = 'Delivery Mode';
  readonly description = 'Filter sections by in-person, online or hybrid';
  readonly priority = 26;

  apply(
    sections: FilterableSection[],
    criteria: DeliveryModeFilterCriteria,
  ): FilterableSection[] {
    if (criteria.modes.length === 0) return sections;
    const wanted = new Set(criteria.modes.map(m => m.toLowerCase()));
    return sections.filter(fs =>
      wanted.has(fs.section.deliveryMode.toLowerCase()),
    );
  }

  isValidCriteria(criteria: unknown): criteria is DeliveryModeFilterCriteria {
    if (!criteria || typeof criteria !== 'object') return false;
    const { modes } = criteria as Record<string, unknown>;
    return Array.isArray(modes) && modes.every(m => typeof m === 'string');
  }

  getDisplayValue(criteria: DeliveryModeFilterCriteria): string {
    return criteria.modes.join(' or ');
  }
}
