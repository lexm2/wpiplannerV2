/**
 * Compatibility checking logic for section combinations
 * Checks cluster constraints and time conflicts between sections
 */

import { PlannerSection, PlannerPeriod } from '../types/outputTypes.js';
import { timeRangesOverlap } from './timeParser.js';

/**
 * Checks if two sections are compatible (can be taken together)
 * Compatibility requires:
 * 1. Cluster constraints satisfied (GPS courses, cluster matching)
 * 2. No time conflicts between meeting periods
 */
export function areCompatible(section1: PlannerSection, section2: PlannerSection): boolean {
    // Check cluster compatibility first
    if (!checkClusterCompatibility(section1, section2)) {
        return false;
    }

    // Check for time conflicts
    if (hasTimeConflict(section1, section2)) {
        return false;
    }

    return true;
}

/**
 * Checks cluster compatibility between two sections
 *
 * GPS Course Rules:
 * - Both sections MUST have the same cluster ID
 * - If either lacks a cluster, they're incompatible
 *
 * Non-GPS Course Rules:
 * - If either section has no cluster → compatible
 * - If both have clusters → they must match
 */
function checkClusterCompatibility(section1: PlannerSection, section2: PlannerSection): boolean {
    const cluster1 = section1.note;
    const cluster2 = section2.note;

    // GPS courses: both MUST have same cluster
    if (section1.is_gps || section2.is_gps) {
        if (!cluster1 || !cluster2) {
            return false; // GPS requires both to have clusters
        }
        return cluster1 === cluster2;
    }

    // Non-GPS: if either has no cluster, they're compatible
    if (!cluster1 || !cluster2) {
        return true;
    }

    // Both have clusters: must match
    return cluster1 === cluster2;
}

/**
 * Checks if two sections have time conflicts
 * Compares all period pairs between the two sections
 */
function hasTimeConflict(section1: PlannerSection, section2: PlannerSection): boolean {
    for (const period1 of section1.periods) {
        for (const period2 of section2.periods) {
            if (periodsConflict(period1, period2)) {
                return true; // Found a conflict
            }
        }
    }

    return false; // No conflicts found
}

/**
 * Checks if two periods conflict with each other
 * Conflict occurs when:
 * 1. Time ranges overlap
 * 2. They share at least one day
 */
function periodsConflict(period1: PlannerPeriod, period2: PlannerPeriod): boolean {
    // Check if times overlap
    const timeOverlap = timeRangesOverlap(
        period1.start_time,
        period1.end_time,
        period2.start_time,
        period2.end_time
    );

    if (!timeOverlap) {
        return false; // No time overlap, no conflict
    }

    // Times overlap - check if they share any days
    const days1 = new Set(period1.days);
    const days2 = new Set(period2.days);

    for (const day of days1) {
        if (days2.has(day)) {
            return true; // Conflict: same day + overlapping time
        }
    }

    return false; // Times overlap but different days
}

/**
 * Filters a list of sections to only those compatible with a reference section
 * Used to build compatibleDiscussions and compatibleLabs arrays
 */
export function filterCompatibleSections(
    referenceSection: PlannerSection,
    candidateSections: PlannerSection[]
): PlannerSection[] {
    return candidateSections.filter(candidate => areCompatible(referenceSection, candidate));
}
