/**
 * PeriodRMPRatingFilter - Filter sections/periods by Rate My Professor ratings
 *
 * Shows sections where ALL periods have professors meeting the criteria.
 * This is stricter than the course-level filter to ensure consistent quality
 * across all class meetings.
 */

import { Period, Section } from '../../types/types';
import { SectionFilter, RMPRatingFilterCriteria } from '../../types/filters';
import { SelectedCourse } from '../../types/schedule';
import { RateMyProfessorService } from '../../services/RateMyProfessorService';

export class PeriodRMPRatingFilter implements SectionFilter {
    readonly id = 'periodRmpRating';
    readonly name = 'Period Rate My Professor';
    readonly description = 'Filter sections/periods by professor ratings';
    readonly priority = 8; // After professor filter (7)

    constructor(private rmpService: RateMyProfessorService) {}

    /**
     * Helper method to check if a professor meets the RMP criteria
     */
    private professorMeetsCriteria(professorName: string, criteria: RMPRatingFilterCriteria): boolean {
        // Skip if no professor assigned
        if (!professorName || professorName === 'Not Assigned') {
            return false;
        }

        // Get RMP data for this professor
        const rmpData = this.rmpService.getRatingDisplay(professorName);

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
    }

    /**
     * Main apply method - delegates to applyToSections
     */
    apply(sections: any[], criteria: any, _activeFilters?: Map<string, any>): any[] {
        return this.applyToSections(sections, criteria);
    }

    /**
     * Apply filter to sections
     * Section passes if ALL its periods have professors meeting criteria
     */
    applyToSections(sections: Section[], criteria: RMPRatingFilterCriteria): Section[] {
        // Check if filter is at default values (filter is "off")
        const isDefaultRating = (criteria.minRating ?? 0) === 0 && (criteria.maxRating ?? 5) === 5;
        const isDefaultDifficulty = (criteria.minDifficulty ?? 0) === 0 && (criteria.maxDifficulty ?? 5) === 5;
        const isDefaultRetake = (criteria.minWouldTakeAgain ?? 0) === 0 && (criteria.maxWouldTakeAgain ?? 100) === 100;

        if (isDefaultRating && isDefaultDifficulty && isDefaultRetake) {
            return sections;
        }

        console.log('[Period RMP Filter] Filtering sections with criteria:', criteria);

        return sections.filter(section => {
            // ALL periods must meet the criteria
            return section.periods.every(period =>
                this.professorMeetsCriteria(period.professor, criteria)
            );
        });
    }

    /**
     * Apply filter to sections with course context
     */
    applyToSectionsWithContext(
        sectionsWithContext: Array<{course: SelectedCourse, section: Section}>,
        criteria: RMPRatingFilterCriteria
    ): Array<{course: SelectedCourse, section: Section}> {
        console.log('[Period RMP Filter] applyToSectionsWithContext called with', sectionsWithContext.length, 'sections');
        console.log('[Period RMP Filter] Criteria:', criteria);

        // Check if filter is at default values (filter is "off")
        const isDefaultRating = (criteria.minRating ?? 0) === 0 && (criteria.maxRating ?? 5) === 5;
        const isDefaultDifficulty = (criteria.minDifficulty ?? 0) === 0 && (criteria.maxDifficulty ?? 5) === 5;
        const isDefaultRetake = (criteria.minWouldTakeAgain ?? 0) === 0 && (criteria.maxWouldTakeAgain ?? 100) === 100;

        console.log('[Period RMP Filter] Default checks:', { isDefaultRating, isDefaultDifficulty, isDefaultRetake });

        if (isDefaultRating && isDefaultDifficulty && isDefaultRetake) {
            console.log('[Period RMP Filter] All criteria at defaults, skipping filter (returning all sections)');
            return sectionsWithContext;
        }

        console.log('[Period RMP Filter] Applying filter (criteria is NOT at defaults)');

        const filtered = sectionsWithContext.filter(item => {
            // ALL periods must meet the criteria
            const passes = item.section.periods.every(period =>
                this.professorMeetsCriteria(period.professor, criteria)
            );
            if (!passes) {
                console.log('[Period RMP Filter] Section', item.section.number, 'filtered OUT');
            }
            return passes;
        });

        console.log('[Period RMP Filter] Result:', filtered.length, 'of', sectionsWithContext.length, 'sections passed');
        return filtered;
    }

    /**
     * Apply filter to individual periods
     */
    applyToPeriods(periods: Period[], criteria: RMPRatingFilterCriteria): Period[] {
        // Check if filter is at default values (filter is "off")
        const isDefaultRating = (criteria.minRating ?? 0) === 0 && (criteria.maxRating ?? 5) === 5;
        const isDefaultDifficulty = (criteria.minDifficulty ?? 0) === 0 && (criteria.maxDifficulty ?? 5) === 5;
        const isDefaultRetake = (criteria.minWouldTakeAgain ?? 0) === 0 && (criteria.maxWouldTakeAgain ?? 100) === 100;

        if (isDefaultRating && isDefaultDifficulty && isDefaultRetake) {
            return periods;
        }

        return periods.filter(period =>
            this.professorMeetsCriteria(period.professor, criteria)
        );
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
