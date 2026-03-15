import { SelectedCourse } from '../types/schedule';
import { Course, Section } from '../types/types';

/**
 * Type guards and validation utilities for runtime data integrity checks
 */

/**
 * Validates that a Section object has all required properties
 */
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

/**
 * Validates that a SelectedCourse object has valid structure and data
 */
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

/**
 * Validates an array of SelectedCourse objects
 * Automatically attempts to repair invalid courses when possible
 */
export function validateSelectedCourses(selectedCourses: unknown[], attemptRepair: boolean = true): SelectedCourse[] {
    if (!Array.isArray(selectedCourses)) {
        console.warn('validateSelectedCourses: Expected array, got:', typeof selectedCourses);
        return [];
    }

    const validCourses: SelectedCourse[] = [];
    const invalidCourses: { index: number; data: unknown }[] = [];
    const repairedCourses: SelectedCourse[] = [];

    selectedCourses.forEach((sc, index) => {
        if (isValidSelectedCourse(sc)) {
            validCourses.push(sc);
        } else {
            // Try to repair invalid courses
            if (attemptRepair) {
                const repaired = repairSelectedCourse(sc);
                if (repaired && isValidSelectedCourse(repaired)) {
                    const scAny = sc as Record<string, unknown>;
                    const courseInfo = scAny.course as Record<string, unknown> | undefined;
                    console.log(`validateSelectedCourses: Successfully repaired course at index ${index} (${courseInfo?.departmentAbbr}${courseInfo?.number})`);
                    validCourses.push(repaired);
                    repairedCourses.push(repaired);
                } else {
                    console.warn(`validateSelectedCourses: Failed to repair course at index ${index}`, sc);
                    invalidCourses.push({ index, data: sc });
                }
            } else {
                invalidCourses.push({ index, data: sc });
            }
        }
    });

    if (repairedCourses.length > 0) {
        console.log(`validateSelectedCourses: Successfully repaired ${repairedCourses.length} invalid course(s)`);
    }

    if (invalidCourses.length > 0) {
        console.warn(`validateSelectedCourses: Found ${invalidCourses.length} unrepairable invalid course(s):`, invalidCourses);
    }

    return validCourses;
}

/**
 * Attempts to repair a SelectedCourse object by fixing common issues
 * Uses getAllSections to properly extract sections from hierarchical course structure
 */
export function repairSelectedCourse(sc: unknown): SelectedCourse | null {
    if (!sc || typeof sc !== 'object') return null;

    const scObj = sc as Partial<SelectedCourse> & Record<string, unknown>;

    if (!scObj.course) return null;

    // Create a repaired version with defaults
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

    // Try to repair hierarchical selections (selectedLecture, selectedDiscussion, selectedLab)
    if (scObj.selectedLecture && !isValidSection(scObj.selectedLecture)) {
        console.warn(`repairSelectedCourse: Invalid selectedLecture, clearing it for course ${(scObj.course as Course).departmentAbbr}${(scObj.course as Course).number}`);
        repaired.selectedLecture = null;
    } else if (scObj.selectedLecture) {
        repaired.selectedLecture = scObj.selectedLecture;
    }

    if (scObj.selectedDiscussion && !isValidSection(scObj.selectedDiscussion)) {
        console.warn(`repairSelectedCourse: Invalid selectedDiscussion, clearing it for course ${(scObj.course as Course).departmentAbbr}${(scObj.course as Course).number}`);
        repaired.selectedDiscussion = null;
    } else if (scObj.selectedDiscussion) {
        repaired.selectedDiscussion = scObj.selectedDiscussion;
    }

    if (scObj.selectedLab && !isValidSection(scObj.selectedLab)) {
        console.warn(`repairSelectedCourse: Invalid selectedLab, clearing it for course ${(scObj.course as Course).departmentAbbr}${(scObj.course as Course).number}`);
        repaired.selectedLab = null;
    } else if (scObj.selectedLab) {
        repaired.selectedLab = scObj.selectedLab;
    }

    return repaired;
}

/**
 * Safe getter for computed term from selected course
 * Checks component fields: lecture, discussion, lab
 */
export function getComputedTerm(sc: SelectedCourse): string | null {
    // Check component fields: lecture, discussion, lab
    // Use lecture as primary source since it's typically the main component
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

/**
 * Validates that a computed term is valid
 */
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