import { SelectedCourse } from '../types/schedule';
import { Section } from '../types/types';

/**
 * Type guards and validation utilities for runtime data integrity checks
 */

/**
 * Validates that a Section object has all required properties
 */
export function isValidSection(section: any): section is Section {
    if (!section || typeof section !== 'object') return false;
    
    return (
        typeof section.crn === 'number' &&
        typeof section.number === 'string' &&
        typeof section.seats === 'number' &&
        typeof section.seatsAvailable === 'number' &&
        typeof section.actualWaitlist === 'number' &&
        typeof section.maxWaitlist === 'number' &&
        typeof section.description === 'string' &&
        typeof section.term === 'string' &&
        typeof section.computedTerm === 'string' &&
        ['A', 'B', 'C', 'D', 'F', 'S'].includes(section.computedTerm)
    );
}

/**
 * Validates that a SelectedCourse object has valid structure and data
 */
export function isValidSelectedCourse(sc: any): sc is SelectedCourse {
    if (!sc || typeof sc !== 'object') return false;
    
    if (!sc.course || typeof sc.course !== 'object') return false;
    
    if (typeof sc.isRequired !== 'boolean') return false;
    
    if (sc.selectedLecture !== null && !isValidSection(sc.selectedLecture)) {
        return false;
    }

    if (sc.selectedDiscussion !== null && !isValidSection(sc.selectedDiscussion)) {
        return false;
    }

    if (sc.selectedLab !== null && !isValidSection(sc.selectedLab)) {
        return false;
    }

    return true;
}

/**
 * Validates an array of SelectedCourse objects
 * Automatically attempts to repair invalid courses when possible
 */
export function validateSelectedCourses(selectedCourses: any[], attemptRepair: boolean = true): SelectedCourse[] {
    if (!Array.isArray(selectedCourses)) {
        console.warn('validateSelectedCourses: Expected array, got:', typeof selectedCourses);
        return [];
    }

    const validCourses: SelectedCourse[] = [];
    const invalidCourses: any[] = [];
    const repairedCourses: SelectedCourse[] = [];

    selectedCourses.forEach((sc, index) => {
        if (isValidSelectedCourse(sc)) {
            validCourses.push(sc);
        } else {
            // Try to repair invalid courses
            if (attemptRepair) {
                const repaired = repairSelectedCourse(sc);
                if (repaired && isValidSelectedCourse(repaired)) {
                    console.log(`validateSelectedCourses: Successfully repaired course at index ${index} (${sc.course?.departmentAbbr}${sc.course?.number})`);
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
export function repairSelectedCourse(sc: any): SelectedCourse | null {
    if (!sc || typeof sc !== 'object' || !sc.course) return null;

    // Import getAllSections dynamically to avoid circular dependencies
    // This is safe because getAllSections is a pure utility function
    let getAllSections: any;
    try {
        getAllSections = require('./courseUtils').getAllSections;
    } catch (e) {
        console.error('repairSelectedCourse: Could not import getAllSections', e);
        return null;
    }

    // Create a repaired version with defaults
    const repaired: SelectedCourse = {
        course: sc.course,
        selectedLecture: null,
        selectedDiscussion: null,
        selectedLab: null,
        isRequired: Boolean(sc.isRequired),
        lockedSections: sc.lockedSections instanceof Set ? sc.lockedSections : new Set()
    };

    // Migrate old selectedSection data to component fields
    if (sc.selectedSection && !sc.selectedLecture && !sc.selectedLab) {
        const allSections = getAllSections(sc.course);
        const hasLectures = allSections.some((s: any) => s.type === 'Lecture' || s.type === 'LEC');

        repaired.selectedLab = hasLectures ? null : sc.selectedSection;
        repaired.selectedLecture = hasLectures ? sc.selectedSection : null;
    }

    // Try to repair hierarchical selections (selectedLecture, selectedDiscussion, selectedLab)
    if (sc.selectedLecture && !isValidSection(sc.selectedLecture)) {
        console.warn(`repairSelectedCourse: Invalid selectedLecture, clearing it for course ${sc.course.departmentAbbr}${sc.course.number}`);
        repaired.selectedLecture = null;
    } else if (sc.selectedLecture) {
        repaired.selectedLecture = sc.selectedLecture;
    }

    if (sc.selectedDiscussion && !isValidSection(sc.selectedDiscussion)) {
        console.warn(`repairSelectedCourse: Invalid selectedDiscussion, clearing it for course ${sc.course.departmentAbbr}${sc.course.number}`);
        repaired.selectedDiscussion = null;
    } else if (sc.selectedDiscussion) {
        repaired.selectedDiscussion = sc.selectedDiscussion;
    }

    if (sc.selectedLab && !isValidSection(sc.selectedLab)) {
        console.warn(`repairSelectedCourse: Invalid selectedLab, clearing it for course ${sc.course.departmentAbbr}${sc.course.number}`);
        repaired.selectedLab = null;
    } else if (sc.selectedLab) {
        repaired.selectedLab = sc.selectedLab;
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
export function isValidComputedTerm(term: any): term is string {
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