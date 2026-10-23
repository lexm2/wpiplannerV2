import type { CourseLevelFilterCriteria } from '../../../types/filters';
import type { FilterableSection } from '../../../types/filterableUnit';
import { courseLevel } from '../../../utils/searchUtils';
import { SectionBasedFilter } from '../SectionFilterPipeline';

const inRange = (n: unknown) =>
  n === undefined || (typeof n === 'number' && n >= 0 && n <= 9);

/**
 * Courses by level, the first digit of the course number: MA 1022 is level
 * 1, CS 3733 level 3, DS 502 and CS 5007 level 5. 1-4 are undergraduate,
 * 5 and up graduate. A course number without digits never passes.
 */
export class CourseLevelRangeFilter implements SectionBasedFilter {
  readonly id = 'courseLevel';
  readonly name = 'Course Level';
  readonly description = 'Filter courses by the level of their number';
  readonly priority = 21;

  apply(
    sections: FilterableSection[],
    criteria: CourseLevelFilterCriteria,
  ): FilterableSection[] {
    const min = criteria.min ?? 0;
    const max = criteria.max ?? 9;
    return sections.filter(fs => {
      const level = courseLevel(fs.course);
      return level !== null && level >= min && level <= max;
    });
  }

  isValidCriteria(criteria: unknown): criteria is CourseLevelFilterCriteria {
    if (!criteria || typeof criteria !== 'object') return false;
    const { min, max } = criteria as Record<string, unknown>;
    return inRange(min) && inRange(max);
  }

  getDisplayValue(criteria: CourseLevelFilterCriteria): string {
    const { min, max } = criteria;
    if (min !== undefined && max !== undefined) {
      return min === max ? `${min}000 level` : `${min}000-${max}000 level`;
    }
    if (min !== undefined) return `${min}000 level and up`;
    if (max !== undefined) return `Up to ${max}000 level`;
    return 'All levels';
  }
}
