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
        ['A', 'B', 'C', 'D'].includes(section.computedTerm)
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
 */
export function validateSelectedCourses(selectedCourses: any[]): SelectedCourse[] {
    if (!Array.isArray(selectedCourses)) {
        console.warn('validateSelectedCourses: Expected array, got:', typeof selectedCourses);
        return [];
    }
    
    const validCourses: SelectedCourse[] = [];
    const invalidCourses: any[] = [];
    
    selectedCourses.forEach((sc, index) => {
        if (isValidSelectedCourse(sc)) {
            validCourses.push(sc);
        } else {
            invalidCourses.push({ index, data: sc });
        }
    });
    
    if (invalidCourses.length > 0) {
        console.warn(`validateSelectedCourses: Found ${invalidCourses.length} invalid course(s):`, invalidCourses);
    }
    
    return validCourses;
}

/**
 * Attempts to repair a SelectedCourse object by fixing common issues
 */
export function repairSelectedCourse(sc: any): SelectedCourse | null {
    if (!sc || typeof sc !== 'object' || !sc.course) return null;
    
    // Create a repaired version
    const repaired: SelectedCourse = {
        course: sc.course,
        selectedSection: null,
        selectedSectionNumber: null,
        isRequired: Boolean(sc.isRequired)
    };
    
    // Try to repair section selection
    if (sc.selectedSectionNumber && typeof sc.selectedSectionNumber === 'string') {
        // Look for the section in the course
        const section = sc.course.sections?.find((s: any) => s.number === sc.selectedSectionNumber);
        
        if (section && isValidSection(section)) {
            repaired.selectedSection = section;
            repaired.selectedSectionNumber = sc.selectedSectionNumber;
        } else {
            console.warn(`repairSelectedCourse: Section ${sc.selectedSectionNumber} not found or invalid for course ${sc.course.department?.abbreviation}${sc.course.number}`);
        }
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
 */
export function getComputedTerm(sc: SelectedCourse): string | null {
    const section = getValidSelectedSection(sc);
    return section?.computedTerm || null;
}

/**
 * Validates that a computed term is valid
 */
export function isValidComputedTerm(term: any): term is string {
    return typeof term === 'string' && ['A', 'B', 'C', 'D'].includes(term);
}