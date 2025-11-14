import { RMPRatingFilterCriteria } from '../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../types/filterableUnit';
import { RateMyProfessorService } from '../../services/RateMyProfessorService';

export class RMPRatingFilter implements SectionBasedFilter {
    readonly id = 'rmpRating';
    readonly name = 'Rate My Professor';
    readonly description = 'Filter courses by professor ratings';
    readonly priority = 8;

    constructor(private rmpService: RateMyProfessorService) {}

    apply(sections: FilterableSection[], criteria: RMPRatingFilterCriteria): FilterableSection[] {
        const isDefaultRating = (criteria.minRating ?? 0) === 0 && (criteria.maxRating ?? 5) === 5;
        const isDefaultDifficulty = (criteria.minDifficulty ?? 0) === 0 && (criteria.maxDifficulty ?? 5) === 5;
        const isDefaultRetake = (criteria.minWouldTakeAgain ?? 0) === 0 && (criteria.maxWouldTakeAgain ?? 100) === 100;
        const isDefaultInclude = (criteria.includeWithoutData ?? true) === true;

        if (isDefaultRating && isDefaultDifficulty && isDefaultRetake && isDefaultInclude) {
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
                const wouldTakeAgain = rmpData.wouldTakeAgain ? parseInt(rmpData.wouldTakeAgain) : null;

                if (criteria.minRating !== undefined && criteria.minRating > 0 && rating < criteria.minRating) {
                    return false;
                }
                if (criteria.maxRating !== undefined && criteria.maxRating < 5 && rating > criteria.maxRating) {
                    return false;
                }

                if (criteria.minDifficulty !== undefined && criteria.minDifficulty > 0 && difficulty < criteria.minDifficulty) {
                    return false;
                }
                if (criteria.maxDifficulty !== undefined && criteria.maxDifficulty < 5 && difficulty > criteria.maxDifficulty) {
                    return false;
                }

                if (wouldTakeAgain !== null) {
                    if (criteria.minWouldTakeAgain !== undefined && criteria.minWouldTakeAgain > 0 && wouldTakeAgain < criteria.minWouldTakeAgain) {
                        return false;
                    }
                    if (criteria.maxWouldTakeAgain !== undefined && criteria.maxWouldTakeAgain < 100 && wouldTakeAgain > criteria.maxWouldTakeAgain) {
                        return false;
                    }
                }

                return true;
            });
        });
    }

    /**
     * Validate that the criteria is properly formatted
     */
    isValidCriteria(criteria: any): criteria is RMPRatingFilterCriteria {
        if (!criteria || typeof criteria !== 'object') {
            return false;
        }

        // Validate rating range if set
        if (criteria.minRating !== undefined && (criteria.minRating < 0 || criteria.minRating > 5)) {
            return false;
        }
        if (criteria.maxRating !== undefined && (criteria.maxRating < 0 || criteria.maxRating > 5)) {
            return false;
        }

        // Validate difficulty range if set
        if (criteria.minDifficulty !== undefined && (criteria.minDifficulty < 0 || criteria.minDifficulty > 5)) {
            return false;
        }
        if (criteria.maxDifficulty !== undefined && (criteria.maxDifficulty < 0 || criteria.maxDifficulty > 5)) {
            return false;
        }

        // Validate "would take again" range if set
        if (criteria.minWouldTakeAgain !== undefined && (criteria.minWouldTakeAgain < 0 || criteria.minWouldTakeAgain > 100)) {
            return false;
        }
        if (criteria.maxWouldTakeAgain !== undefined && (criteria.maxWouldTakeAgain < 0 || criteria.maxWouldTakeAgain > 100)) {
            return false;
        }

        return true;
    }

    /**
     * Get a human-readable display value for the active filter
     */
    getDisplayValue(criteria: RMPRatingFilterCriteria): string {
        const parts: string[] = [];

        // Show rating range if not at defaults
        const minRating = criteria.minRating ?? 0;
        const maxRating = criteria.maxRating ?? 5;
        if (minRating > 0 || maxRating < 5) {
            parts.push(`${minRating.toFixed(1)}-${maxRating.toFixed(1)} rating`);
        }

        // Show difficulty range if not at defaults
        const minDifficulty = criteria.minDifficulty ?? 0;
        const maxDifficulty = criteria.maxDifficulty ?? 5;
        if (minDifficulty > 0 || maxDifficulty < 5) {
            parts.push(`${minDifficulty.toFixed(1)}-${maxDifficulty.toFixed(1)} difficulty`);
        }

        // Show "would take again" range if not at defaults
        const minRetake = criteria.minWouldTakeAgain ?? 0;
        const maxRetake = criteria.maxWouldTakeAgain ?? 100;
        if (minRetake > 0 || maxRetake < 100) {
            parts.push(`${minRetake}-${maxRetake}% retake`);
        }

        return parts.length > 0 ? `RMP: ${parts.join(', ')}` : 'RMP filters';
    }
}
