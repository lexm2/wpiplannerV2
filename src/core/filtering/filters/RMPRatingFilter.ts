import type { RMPRatingFilterCriteria } from '../../../types/filters';
import type { FilterableSection } from '../../../types/filterableUnit';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import { RateMyProfessorService } from '../../../services/external/RateMyProfessorService';

export class RMPRatingFilter implements SectionBasedFilter {
  readonly id = 'rmpRating';
  readonly name = 'Rate My Professor';
  readonly description = 'Filter courses by professor ratings';
  readonly priority = 8;

  constructor(private rmpService: RateMyProfessorService) {}

  apply(
    sections: FilterableSection[],
    criteria: RMPRatingFilterCriteria,
  ): FilterableSection[] {
    const isDefaultRating =
      (criteria.minRating ?? 0) === 0 && (criteria.maxRating ?? 5) === 5;
    const isDefaultDifficulty =
      (criteria.minDifficulty ?? 0) === 0 &&
      (criteria.maxDifficulty ?? 5) === 5;
    const isDefaultRetake =
      (criteria.minWouldTakeAgain ?? 0) === 0 &&
      (criteria.maxWouldTakeAgain ?? 100) === 100;
    const isDefaultInclude = (criteria.includeWithoutData ?? true) === true;

    if (
      isDefaultRating &&
      isDefaultDifficulty &&
      isDefaultRetake &&
      isDefaultInclude
    ) {
      return sections;
    }

    return sections.filter(fs => {
      return fs.section.periods.some(period => {
        if (!period.professor || period.professor === 'Not Assigned') {
          return false;
        }

        const rmpData = this.rmpService.getRatingDisplay(period.professor);

        if (!rmpData) {
          return criteria.includeWithoutData ?? true;
        }

        const rating = parseFloat(rmpData.rating);
        const difficulty = parseFloat(rmpData.difficulty);
        const wouldTakeAgain = rmpData.wouldTakeAgain
          ? parseInt(rmpData.wouldTakeAgain)
          : null;

        if (
          criteria.minRating !== undefined &&
          criteria.minRating > 0 &&
          rating < criteria.minRating
        ) {
          return false;
        }
        if (
          criteria.maxRating !== undefined &&
          criteria.maxRating < 5 &&
          rating > criteria.maxRating
        ) {
          return false;
        }

        if (
          criteria.minDifficulty !== undefined &&
          criteria.minDifficulty > 0 &&
          difficulty < criteria.minDifficulty
        ) {
          return false;
        }
        if (
          criteria.maxDifficulty !== undefined &&
          criteria.maxDifficulty < 5 &&
          difficulty > criteria.maxDifficulty
        ) {
          return false;
        }

        if (wouldTakeAgain !== null) {
          if (
            criteria.minWouldTakeAgain !== undefined &&
            criteria.minWouldTakeAgain > 0 &&
            wouldTakeAgain < criteria.minWouldTakeAgain
          ) {
            return false;
          }
          if (
            criteria.maxWouldTakeAgain !== undefined &&
            criteria.maxWouldTakeAgain < 100 &&
            wouldTakeAgain > criteria.maxWouldTakeAgain
          ) {
            return false;
          }
        }

        return true;
      });
    });
  }

  isValidCriteria(criteria: unknown): criteria is RMPRatingFilterCriteria {
    if (!criteria || typeof criteria !== 'object') {
      return false;
    }

    const c = criteria as Record<string, unknown>;

    if (
      c.minRating !== undefined &&
      (typeof c.minRating !== 'number' || c.minRating < 0 || c.minRating > 5)
    ) {
      return false;
    }
    if (
      c.maxRating !== undefined &&
      (typeof c.maxRating !== 'number' || c.maxRating < 0 || c.maxRating > 5)
    ) {
      return false;
    }

    if (
      c.minDifficulty !== undefined &&
      (typeof c.minDifficulty !== 'number' ||
        c.minDifficulty < 0 ||
        c.minDifficulty > 5)
    ) {
      return false;
    }
    if (
      c.maxDifficulty !== undefined &&
      (typeof c.maxDifficulty !== 'number' ||
        c.maxDifficulty < 0 ||
        c.maxDifficulty > 5)
    ) {
      return false;
    }

    if (
      c.minWouldTakeAgain !== undefined &&
      (typeof c.minWouldTakeAgain !== 'number' ||
        c.minWouldTakeAgain < 0 ||
        c.minWouldTakeAgain > 100)
    ) {
      return false;
    }
    if (
      c.maxWouldTakeAgain !== undefined &&
      (typeof c.maxWouldTakeAgain !== 'number' ||
        c.maxWouldTakeAgain < 0 ||
        c.maxWouldTakeAgain > 100)
    ) {
      return false;
    }

    return true;
  }

  getDisplayValue(criteria: RMPRatingFilterCriteria): string {
    const parts: string[] = [];

    const minRating = criteria.minRating ?? 0;
    const maxRating = criteria.maxRating ?? 5;
    if (minRating > 0 || maxRating < 5) {
      parts.push(`${minRating.toFixed(1)}-${maxRating.toFixed(1)} rating`);
    }

    const minDifficulty = criteria.minDifficulty ?? 0;
    const maxDifficulty = criteria.maxDifficulty ?? 5;
    if (minDifficulty > 0 || maxDifficulty < 5) {
      parts.push(
        `${minDifficulty.toFixed(1)}-${maxDifficulty.toFixed(1)} difficulty`,
      );
    }

    const minRetake = criteria.minWouldTakeAgain ?? 0;
    const maxRetake = criteria.maxWouldTakeAgain ?? 100;
    if (minRetake > 0 || maxRetake < 100) {
      parts.push(`${minRetake}-${maxRetake}% retake`);
    }

    return parts.length > 0 ? `RMP: ${parts.join(', ')}` : 'RMP filters';
  }
}
