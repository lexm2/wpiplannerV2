/**
 * Leaves out sections whose registration status is Closed. Unlike full or
 * waitlisted sections, a Closed one cannot be registered for at all (and
 * check_conflicts reports it as an error), so schedule generation drops it
 * by default. That is a rule about what can be registered, not a ranking
 * preference, so it does not break "preferences only order".
 */
import * as z from 'zod';
import type { SectionBasedFilter } from '../core/filtering/SectionFilterPipeline';
import type { FilterableSection } from '../types/filterableUnit';

const ClosedSectionsCriteriaSchema = z.object({});

export class ClosedSectionsFilter implements SectionBasedFilter {
  static readonly id = 'closedSections';
  static readonly criteria = ClosedSectionsCriteriaSchema;
  readonly id = ClosedSectionsFilter.id;
  readonly criteria = ClosedSectionsFilter.criteria;
  readonly name = 'Closed sections';
  readonly description = 'Leave out sections that are Closed for registration';
  // The availability filter's priority: both drop sections by seats.
  readonly priority = 50;

  apply(sections: FilterableSection[]): FilterableSection[] {
    return sections.filter(fs => fs.section.status !== 'Closed');
  }

  getDisplayValue(): string {
    return 'Not closed';
  }
}
