import { SelectedCourse } from '../types/schedule';
import { Course, Section } from '../types/types';
import { logger } from './logger'

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

export function isValidSelectedCourse(sc: unknown): sc is SelectedCourse {
    if (!sc || typeof sc !== 'object') return false;

    const scObj = sc as Record<string, unknown>;

    if (!scObj.course || typeof scObj.course !== 'object') return false;

    if (typeof scObj.isRequired !== 'boolean') return false;

    if (scObj.selectedLecture !== null && !isValidSection(scObj.selectedLecture)) {
        return false;
    }

    if (scObj.selectedDiscussion !== null && !isValidSection(scObj.selectedDiscussion)) {
        return false;
    }

    if (scObj.selectedLab !== null && !isValidSection(scObj.selectedLab)) {
        return false;
    }

    return true;
}

/** Validates an array of SelectedCourse objects, repairing invalid ones when possible. */
export function validateSelectedCourses(selectedCourses: unknown[], attemptRepair: boolean = true): SelectedCourse[] {
    if (!Array.isArray(selectedCourses)) {
        logger.warn('validateSelectedCourses: Expected array, got:', typeof selectedCourses);
        return [];
    }

    const validCourses: SelectedCourse[] = [];
    const invalidCourses: { index: number; data: unknown }[] = [];
    const repairedCourses: SelectedCourse[] = [];

    selectedCourses.forEach((sc, index) => {
        if (isValidSelectedCourse(sc)) {
            validCourses.push(sc);
        } else {
            if (attemptRepair) {
                const repaired = repairSelectedCourse(sc);
                if (repaired && isValidSelectedCourse(repaired)) {
                    validCourses.push(repaired);
                    repairedCourses.push(repaired);
                } else {
                    logger.warn(`validateSelectedCourses: Failed to repair course at index ${index}`, sc);
                    invalidCourses.push({ index, data: sc });
                }
            } else {
                invalidCourses.push({ index, data: sc });
            }
        }
    });

    if (repairedCourses.length > 0) {
        logger.warn(`validateSelectedCourses: repaired ${repairedCourses.length} invalid course(s)`);
    }

    if (invalidCourses.length > 0) {
        logger.warn(`validateSelectedCourses: Found ${invalidCourses.length} unrepairable invalid course(s):`, invalidCourses);
    }

    return validCourses;
}

/** Attempts to repair a SelectedCourse object by fixing common issues. */
export function repairSelectedCourse(sc: unknown): SelectedCourse | null {
    if (!sc || typeof sc !== 'object') return null;

    const scObj = sc as Partial<SelectedCourse> & Record<string, unknown>;

    if (!scObj.course) return null;

    const repaired: SelectedCourse = {
        course: scObj.course as Course,
        selectedLecture: null,
        selectedDiscussion: null,
        selectedLab: null,
        isRequired: Boolean(scObj.isRequired),
        lockedSections: scObj.lockedSections instanceof Set ? scObj.lockedSections : new Set()
    };

    // Migrate old selectedSection data to component fields
    if (scObj.selectedSection && !scObj.selectedLecture && !scObj.selectedLab) {
        const course = scObj.course as Course;
        const hasLectures = Boolean(course.lectures && course.lectures.length > 0);

        repaired.selectedLab = hasLectures ? null : scObj.selectedSection as Section;
        repaired.selectedLecture = hasLectures ? scObj.selectedSection as Section : null;
    }

    if (scObj.selectedLecture && !isValidSection(scObj.selectedLecture)) {
        logger.warn(`repairSelectedCourse: Invalid selectedLecture, clearing it for course ${(scObj.course as Course).departmentAbbr}${(scObj.course as Course).number}`);
        repaired.selectedLecture = null;
    } else if (scObj.selectedLecture) {
        repaired.selectedLecture = scObj.selectedLecture;
    }

    if (scObj.selectedDiscussion && !isValidSection(scObj.selectedDiscussion)) {
        logger.warn(`repairSelectedCourse: Invalid selectedDiscussion, clearing it for course ${(scObj.course as Course).departmentAbbr}${(scObj.course as Course).number}`);
        repaired.selectedDiscussion = null;
    } else if (scObj.selectedDiscussion) {
        repaired.selectedDiscussion = scObj.selectedDiscussion;
    }

    if (scObj.selectedLab && !isValidSection(scObj.selectedLab)) {
        logger.warn(`repairSelectedCourse: Invalid selectedLab, clearing it for course ${(scObj.course as Course).departmentAbbr}${(scObj.course as Course).number}`);
        repaired.selectedLab = null;
    } else if (scObj.selectedLab) {
        repaired.selectedLab = scObj.selectedLab;
    }

    return repaired;
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