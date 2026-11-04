/**
 * The ended-term rule for a search of every year. A plain search drops
 * ended terms with the term filter, but with academicYear "all" that would
 * drop the same letter in every year (2027-28's A with 2026-27's), so this
 * drops only the given year's sections in the given terms.
 */
import * as z from 'zod';
import type { SectionBasedFilter } from '../core/filtering/SectionFilterPipeline';
import type { FilterableSection } from '../types/filterableUnit';

const EndedTermsCriteriaSchema = z.object({
  /** The year whose terms have ended: the current one. */
  year: z.number(),
  terms: z.array(z.string()),
});
export type EndedTermsCriteria = z.output<typeof EndedTermsCriteriaSchema>;

export class EndedTermsFilter implements SectionBasedFilter {
  static readonly id = 'endedTerms';
  static readonly criteria = EndedTermsCriteriaSchema;
  readonly id = EndedTermsFilter.id;
  readonly criteria = EndedTermsFilter.criteria;
  readonly name = 'Ended terms';
  readonly description = "Leave out sections of this year's ended terms";
  // With the term filter.
  readonly priority = 25;

  apply(sections: FilterableSection[], criteria: unknown): FilterableSection[] {
    const { year, terms } = criteria as EndedTermsCriteria;
    return sections.filter(
      fs =>
        fs.course.academicYear !== year ||
        !terms.includes(fs.section.computedTerm),
    );
  }

  getDisplayValue(criteria: unknown): string {
    return `Ended: ${(criteria as EndedTermsCriteria).terms.join(', ')}`;
  }
}
