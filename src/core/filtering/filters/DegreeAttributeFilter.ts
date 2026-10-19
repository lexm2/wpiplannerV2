import type { DegreeAttributeFilterCriteria } from '../../../types/filters';
import type { FilterableSection } from '../../../types/filterableUnit';
import { SectionBasedFilter } from '../SectionFilterPipeline';

/**
 * Courses that count toward any of the given degree attributes, from
 * Workday's tags ("Humanities and Arts", "Social Sciences", "Capstone Design
 * Experience"...). Matched case-insensitively against the course's union of
 * its sections' tags, which answers "can this course count for X".
 */
export class DegreeAttributeFilter implements SectionBasedFilter {
  readonly id = 'degreeAttribute';
  readonly name = 'Degree Attribute';
  readonly description =
    'Filter courses by the degree requirements they count toward';
  readonly priority = 22;

  apply(
    sections: FilterableSection[],
    criteria: DegreeAttributeFilterCriteria,
  ): FilterableSection[] {
    if (criteria.attributes.length === 0) return sections;
    const wanted = new Set(criteria.attributes.map(a => a.toLowerCase()));
    return sections.filter(fs =>
      fs.course.degreeAttributes.some(a => wanted.has(a.toLowerCase())),
    );
  }

  isValidCriteria(
    criteria: unknown,
  ): criteria is DegreeAttributeFilterCriteria {
    if (!criteria || typeof criteria !== 'object') return false;
    const { attributes } = criteria as Record<string, unknown>;
    return (
      Array.isArray(attributes) && attributes.every(a => typeof a === 'string')
    );
  }

  getDisplayValue(criteria: DegreeAttributeFilterCriteria): string {
    return criteria.attributes.join(' or ');
  }
}
