import { SelectedCourse } from '../types/schedule';
import { Section } from '../types/types';

/** Type guards and validation utilities for runtime data integrity checks. */

export function isValidSection(section: unknown): section is Section {
    if (!section || typeof section !== 'object') return false;

    const s = section as Record<string, unknown>;

    return (
        typeof s.crn === 'number' &&
        typeof s.number === 'string' &&
        typeof s.seats === 'number' &&
        typeof s.seatsAvailable === 'number' &&
        typeof s.actualWaitlist === 'number' &&
        typeof s.maxWaitlist === 'number' &&
        typeof s.computedTerm === 'string' &&
        ['A', 'B', 'C', 'D', 'F', 'S'].includes(s.computedTerm)
    );
}

/** Safe getter for computed term, checking lecture, then discussion, then lab. */
export function getComputedTerm(sc: SelectedCourse): string | null {
    // Lecture is the primary source since it's typically the main component
    if (sc.selectedLecture?.computedTerm) {
        return sc.selectedLecture.computedTerm;
    }

    if (sc.selectedDiscussion?.computedTerm) {
        return sc.selectedDiscussion.computedTerm;
    }

    if (sc.selectedLab?.computedTerm) {
        return sc.selectedLab.computedTerm;
    }

    return null;
}

export function isValidComputedTerm(term: unknown): term is string {
    return typeof term === 'string' && ['A', 'B', 'C', 'D', 'F', 'S'].includes(term);
}

/**
 * Maps a computed term to display terms
 * F (Fall graduate) → ['A', 'B']
 * S (Spring graduate) → ['C', 'D']
 * A/B/C/D → [term]
 */
export function getDisplayTerms(computedTerm: string): string[] {
    if (computedTerm === 'F') {
        return ['A', 'B'];
    } else if (computedTerm === 'S') {
        return ['C', 'D'];
    }
    return [computedTerm];
}