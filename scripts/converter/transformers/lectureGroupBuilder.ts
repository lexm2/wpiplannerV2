/**
 * Builds hierarchical lecture groups with compatible discussions and labs
 * This implements the NEW structure instead of flat combined sections
 */

import { LectureGroup, PlannerSection } from '../types/outputTypes.js';
import { CategorizedSections } from './sectionTransformer.js';
import { filterCompatibleSections } from '../utils/compatibilityChecker.js';

/**
 * Builds lecture groups from categorized sections
 * Each lecture gets lists of compatible discussions and labs
 */
export function buildLectureGroups(categorized: CategorizedSections): LectureGroup[] {
    const lectureGroups: LectureGroup[] = [];

    for (const lecture of categorized.lectures) {
        // Handle GPS sections without cluster or Interest Lists
        // These cannot be combined with other sections
        if ((lecture.is_gps && !lecture.note) || lecture.is_interest_list) {
            lectureGroups.push({
                section: lecture,
                compatibleDiscussions: [],
                compatibleLabs: []
            });
            continue;
        }

        // Build compatibility lists for this lecture
        const compatibleDiscussions = filterCompatibleSections(lecture, categorized.discussions);
        const compatibleLabs = filterCompatibleSections(lecture, categorized.labs);

        lectureGroups.push({
            section: lecture,
            compatibleDiscussions,
            compatibleLabs
        });
    }

    return lectureGroups;
}

/**
 * Creates lecture groups for "other" type sections (Seminars, etc.)
 * These are treated like lectures but have empty compatibility arrays
 */
export function buildOtherLectureGroups(otherSections: PlannerSection[]): LectureGroup[] {
    return otherSections.map(section => ({
        section,
        compatibleDiscussions: [],
        compatibleLabs: []
    }));
}
