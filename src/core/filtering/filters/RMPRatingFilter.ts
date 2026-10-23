import type { RMPRatingFilterCriteria } from '../../../types/filters';
import type { FilterableSection } from '../../../types/filterableUnit';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import { keepMatchingGroups } from '../lectureGroupScope';
import { SectionType } from '../../../types/types';
import { RateMyProfessorService } from '../../../services/external/RateMyProfessorService';

type RatingNumbers = NonNullable<
  ReturnType<RateMyProfessorService['getRatings']>
>;

/** Every named instructor of the section's periods, co-instructors split. */
function instructorsOf(fs: FilterableSection): string[] {
  const names = fs.section.periods.flatMap(period =>
    (period.professor ?? '').split(/\s*;\s*/),
  );
  return [...new Set(names.filter(name => name && name !== 'Not Assigned'))];
}

/**
 * The ratings fall within every bound set. A bound at its default is no
 * bound, and a retake bound is skipped when RMP has no retake share.
 */
function withinBounds(
  { rating, difficulty, wouldTakeAgain }: RatingNumbers,
  criteria: RMPRatingFilterCriteria,
): boolean {
  const { minRating, maxRating, minDifficulty, maxDifficulty } = criteria;
  if (minRating !== undefined && minRating > 0 && rating < minRating) {
    return false;
  }
  if (maxRating !== undefined && maxRating < 5 && rating > maxRating) {
    return false;
  }
  if (
    minDifficulty !== undefined &&
    minDifficulty > 0 &&
    difficulty < minDifficulty
  ) {
    return false;
  }
  if (
    maxDifficulty !== undefined &&
    maxDifficulty < 5 &&
    difficulty > maxDifficulty
  ) {
    return false;
  }
  if (wouldTakeAgain === null) return true;
  const { minWouldTakeAgain, maxWouldTakeAgain } = criteria;
  if (
    minWouldTakeAgain !== undefined &&
    minWouldTakeAgain > 0 &&
    wouldTakeAgain < minWouldTakeAgain
  ) {
    return false;
  }
  return !(
    maxWouldTakeAgain !== undefined &&
    maxWouldTakeAgain < 100 &&
    wouldTakeAgain > maxWouldTakeAgain
  );
}

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
    const minNumRatings = criteria.minNumRatings ?? 0;

    if (
      isDefaultRating &&
      isDefaultDifficulty &&
      isDefaultRetake &&
      isDefaultInclude &&
      minNumRatings <= 0
    ) {
      return sections;
    }

    const includeWithoutData = criteria.includeWithoutData ?? true;
    // Judged on who teaches the lecture, and the group rises or falls with
    // it: labs and discussions are mostly TA-run or unassigned, and a
    // well-rated TA should not qualify a lecture either.
    return keepMatchingGroups(sections, fs => {
      if (fs.sectionType !== SectionType.LECTURE && fs.lectureGroup) {
        return false;
      }
      // Each co-instructor on their own ("Amy Curran; Laura Susanin"): the
      // lecture passes when any instructor with ratings passes, and counts
      // as without data only when none has ratings (or enough of them), so
      // an unrated co-instructor neither hides nor rescues a rated one.
      const rated = instructorsOf(fs)
        .map(name => this.rmpService.getRatings(name))
        .filter(
          (r): r is RatingNumbers =>
            r !== null && r.numRatings >= minNumRatings,
        );
      if (rated.length === 0) return includeWithoutData;
      return rated.some(ratings => withinBounds(ratings, criteria));
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

    if (
      c.minNumRatings !== undefined &&
      (typeof c.minNumRatings !== 'number' || c.minNumRatings < 0)
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

    if ((criteria.minNumRatings ?? 0) > 0) {
      parts.push(`${criteria.minNumRatings}+ ratings`);
    }

    return parts.length > 0 ? `RMP: ${parts.join(', ')}` : 'RMP filters';
  }
}
