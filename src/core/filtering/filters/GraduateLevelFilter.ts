import { GraduateLevelFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';

/** The undergraduate levels the Course Level filter can narrow to. */
export const UNDERGRAD_LEVELS = [1000, 2000, 3000, 4000] as const;

/**
 * A course's level: its number's leading digit x 1000 (`174X` is 1000, `3010`
 * is 3000). Null when the number does not start with a digit.
 */
export function courseLevelOf(course: { number: string }): number | null {
  const digit = /^\d/.exec(course.number.trim());
  return digit ? Number(digit[0]) * 1000 : null;
}

export class GraduateLevelFilter implements SectionBasedFilter {
  readonly id = 'graduateLevel';
  readonly name = 'Graduate Level';
  readonly description = 'Filter courses by graduate/undergraduate level';
  readonly priority = 80;

  apply(
    sections: FilterableSection[],
    criteria: GraduateLevelFilterCriteria,
  ): FilterableSection[] {
    if (criteria.level === 'all') {
      return sections;
    }

    return sections.filter(fs => {
      const isGraduate = fs.course.isGraduate ?? false;

      if (criteria.level === 'graduate') {
        return isGraduate;
      } else if (criteria.level === 'undergraduate') {
        if (isGraduate) return false;
        return (
          criteria.undergradLevel === undefined ||
          courseLevelOf(fs.course) === criteria.undergradLevel
        );
      }

      return true;
    });
  }

  isValidCriteria(criteria: unknown): criteria is GraduateLevelFilterCriteria {
    if (!criteria || typeof criteria !== 'object' || !('level' in criteria))
      return false;
    const c = criteria as Record<string, unknown>;
    return (
      typeof c.level === 'string' &&
      ['all', 'undergraduate', 'graduate'].includes(c.level) &&
      (c.undergradLevel === undefined ||
        (typeof c.undergradLevel === 'number' &&
          (UNDERGRAD_LEVELS as readonly number[]).includes(c.undergradLevel)))
    );
  }

  getDisplayValue(criteria: GraduateLevelFilterCriteria): string {
    switch (criteria.level) {
      case 'graduate':
        return 'Graduate Only';
      case 'undergraduate':
        return criteria.undergradLevel === undefined
          ? 'Undergraduate Only'
          : `Undergraduate Only - ${criteria.undergradLevel} level`;
      case 'all':
        return 'All Levels';
      default:
        return 'Unknown Level';
    }
  }
}
