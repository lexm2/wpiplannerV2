/**
 * RMPRatingFilter - Filter courses by Rate My Professor ratings
 *
 * Shows courses that have AT LEAST ONE section with a professor meeting the criteria.
 * Criteria can include minimum rating, maximum difficulty, and minimum "would take again" percentage.
 * Professors without RMP data are excluded when this filter is active.
 */

import { Course } from '../../types/types';
import { CourseFilter, RMPRatingFilterCriteria } from '../../types/filters';
import { RateMyProfessorService } from '../../services/RateMyProfessorService';

export class RMPRatingFilter implements CourseFilter {
    readonly id = 'rmpRating';
    readonly name = 'Rate My Professor';
    readonly description = 'Filter courses by professor ratings';
    readonly priority = 8; // After professor filter (7), before availability (99)

    constructor(private rmpService: RateMyProfessorService) {}

    /**
     * Apply the RMP rating filter to courses
     * A course passes if at least one section has a professor meeting all criteria
     */
    apply(courses: Course[], criteria: RMPRatingFilterCriteria): Course[] {
        // Check if filter is at default values (filter is "off")
        const isDefaultRating = (criteria.minRating ?? 0) === 0 && (criteria.maxRating ?? 5) === 5;
        const isDefaultDifficulty = (criteria.minDifficulty ?? 0) === 0 && (criteria.maxDifficulty ?? 5) === 5;
        const isDefaultRetake = (criteria.minWouldTakeAgain ?? 0) === 0 && (criteria.maxWouldTakeAgain ?? 100) === 100;

        if (isDefaultRating && isDefaultDifficulty && isDefaultRetake) {
            return courses;
        }

        console.log('[RMP Filter] Filtering courses with criteria:', criteria);

        return courses.filter(course => {
            // Check if any section has a professor that meets the criteria
            const hasQualifyingSection = course.sections?.some(section => {
                // Check all periods in the section
                return section.periods.some(period => {
                    // Skip if no professor assigned
                    if (!period.professor || period.professor === 'Not Assigned') {
                        return false;
                    }

                    // Get RMP data for this professor
                    const rmpData = this.rmpService.getRatingDisplay(period.professor);

                    // If no RMP data, include this professor (can't filter without data)
                    if (!rmpData) {
                        return true;
                    }

                    const rating = parseFloat(rmpData.rating);
                    const difficulty = parseFloat(rmpData.difficulty);
                    const wouldTakeAgain = rmpData.wouldTakeAgain ? parseInt(rmpData.wouldTakeAgain) : null;

                    // Check rating range
                    if (criteria.minRating !== undefined && criteria.minRating > 0 && rating < criteria.minRating) {
                        return false;
                    }
                    if (criteria.maxRating !== undefined && criteria.maxRating < 5 && rating > criteria.maxRating) {
                        return false;
                    }

                    // Check difficulty range
                    if (criteria.minDifficulty !== undefined && criteria.minDifficulty > 0 && difficulty < criteria.minDifficulty) {
                        return false;
                    }
                    if (criteria.maxDifficulty !== undefined && criteria.maxDifficulty < 5 && difficulty > criteria.maxDifficulty) {
                        return false;
                    }

                    // Check "would take again" range (only if data exists)
                    if (wouldTakeAgain !== null) {
                        if (criteria.minWouldTakeAgain !== undefined && criteria.minWouldTakeAgain > 0 && wouldTakeAgain < criteria.minWouldTakeAgain) {
                            return false;
                        }
                        if (criteria.maxWouldTakeAgain !== undefined && criteria.maxWouldTakeAgain < 100 && wouldTakeAgain > criteria.maxWouldTakeAgain) {
                            return false;
                        }
                    }

                    // All criteria passed
                    return true;
                });
            }) ?? false;

            return hasQualifyingSection;
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
