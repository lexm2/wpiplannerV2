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
    
    // Check course object exists
    if (!sc.course || typeof sc.course !== 'object') return false;
    
    // Check basic SelectedCourse properties
    if (typeof sc.isRequired !== 'boolean') return false;
    
    // Check selectedSectionNumber is either null or string
    if (sc.selectedSectionNumber !== null && typeof sc.selectedSectionNumber !== 'string') {
        return false;
    }
    
    // Check selectedSection consistency
    if (sc.selectedSection !== null) {
        // If selectedSection exists, it must be a valid Section
        if (!isValidSection(sc.selectedSection)) return false;
        
        // If selectedSection exists, selectedSectionNumber should match
        if (sc.selectedSectionNumber !== sc.selectedSection.number) return false;
    } else {
        // If selectedSection is null, selectedSectionNumber should also be null
        if (sc.selectedSectionNumber !== null) return false;
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
                    console.log(`validateSelectedCourses: Successfully repaired course at index ${index} (${sc.course?.department?.abbreviation}${sc.course?.number})`);
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
        selectedSection: null,
        selectedSectionNumber: null,
        selectedLecture: null,
        selectedDiscussion: null,
        selectedLab: null,
        isRequired: Boolean(sc.isRequired),
        lockedSections: sc.lockedSections instanceof Set ? sc.lockedSections : new Set()
    };

    // Try to repair section selection
    if (sc.selectedSectionNumber && typeof sc.selectedSectionNumber === 'string') {
        // Use getAllSections to properly extract sections from hierarchical structure
        const allSections = getAllSections(sc.course);
        const section = allSections.find((s: any) => s.number === sc.selectedSectionNumber);

        if (section && isValidSection(section)) {
            repaired.selectedSection = section;
            repaired.selectedSectionNumber = sc.selectedSectionNumber;
            console.log(`repairSelectedCourse: Repaired section ${sc.selectedSectionNumber} for course ${sc.course.department?.abbreviation}${sc.course.number}`);
        } else {
            console.warn(`repairSelectedCourse: Section ${sc.selectedSectionNumber} not found or invalid for course ${sc.course.department?.abbreviation}${sc.course.number}`);
        }
    }

    // Try to repair hierarchical selections (selectedLecture, selectedDiscussion, selectedLab)
    if (sc.selectedLecture && !isValidSection(sc.selectedLecture)) {
        console.warn(`repairSelectedCourse: Invalid selectedLecture, clearing it for course ${sc.course.department?.abbreviation}${sc.course.number}`);
        repaired.selectedLecture = null;
    } else if (sc.selectedLecture) {
        repaired.selectedLecture = sc.selectedLecture;
    }

    if (sc.selectedDiscussion && !isValidSection(sc.selectedDiscussion)) {
        console.warn(`repairSelectedCourse: Invalid selectedDiscussion, clearing it for course ${sc.course.department?.abbreviation}${sc.course.number}`);
        repaired.selectedDiscussion = null;
    } else if (sc.selectedDiscussion) {
        repaired.selectedDiscussion = sc.selectedDiscussion;
    }

    if (sc.selectedLab && !isValidSection(sc.selectedLab)) {
        console.warn(`repairSelectedCourse: Invalid selectedLab, clearing it for course ${sc.course.department?.abbreviation}${sc.course.number}`);
        repaired.selectedLab = null;
    } else if (sc.selectedLab) {
        repaired.selectedLab = sc.selectedLab;
    }

    return repaired;
}

/**
 * Safe getter for selected course section with validation
 */
export function getValidSelectedSection(sc: SelectedCourse): Section | null {
    if (!sc.selectedSection) return null;
    
    if (!isValidSection(sc.selectedSection)) {
        console.warn('getValidSelectedSection: Invalid section detected:', sc.selectedSection);
        return null;
    }
    
    return sc.selectedSection;
}

/**
 * Safe getter for computed term from selected course
 * Supports both flat structure (selectedSection) and hierarchical structure (selectedLecture/Discussion/Lab)
 */
export function getComputedTerm(sc: SelectedCourse): string | null {
    // First try selectedSection (flat structure)
    const section = getValidSelectedSection(sc);
    if (section?.computedTerm) {
        return section.computedTerm;
    }

    // Fallback to hierarchical structure: check lecture/discussion/lab
    // Use lecture as primary source since it's always required
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