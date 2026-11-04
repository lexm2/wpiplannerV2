import {
  DeliveryModeFilterCriteriaSchema,
  type DeliveryModeFilterCriteria,
} from '../../../types/filters';
import type { FilterableSection } from '../../../types/filterableUnit';
import { SectionBasedFilter } from '../SectionFilterPipeline';

/**
 * Sections taught in any of the given modes ("In-Person", "Online",
 * "Hybrid"), case-insensitively. Per section, like term: a lecture's labs
 * must pass too. Asynchronous meetings are a property of a period, not a
 * mode; an Online section may still meet at set times.
 */
export class DeliveryModeFilter implements SectionBasedFilter {
  static readonly id = 'deliveryMode';
  static readonly criteria = DeliveryModeFilterCriteriaSchema;
  readonly id = DeliveryModeFilter.id;
  readonly criteria = DeliveryModeFilter.criteria;
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

  getDisplayValue(criteria: DeliveryModeFilterCriteria): string {
    return criteria.modes.join(' or ');
  }
}
