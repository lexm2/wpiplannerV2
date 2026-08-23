import { GraduateLevelFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';

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
        return !isGraduate;
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
      ['all', 'undergraduate', 'graduate'].includes(c.level)
    );
  }

  getDisplayValue(criteria: GraduateLevelFilterCriteria): string {
    switch (criteria.level) {
      case 'graduate':
        return 'Graduate Only';
      case 'undergraduate':
        return 'Undergraduate Only';
      case 'all':
        return 'All Levels';
      default:
        return 'Unknown Level';
    }
  }
}
