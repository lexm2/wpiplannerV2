/**
 * Course Utility Functions
 * Helper functions for processing and formatting course data
 */

import { Course, Section } from '../types/types';

/**
 * Flattens hierarchical lecture structure into a single array of all sections
 * @param course - The course to extract sections from
 * @returns Array of all sections (lectures, discussions, labs, and standalone labs)
 */
export function getAllSections(course: Course): Section[] {
    const sections: Section[] = [];

    if (course.lectures) {
        course.lectures.forEach(lectureGroup => {
            sections.push(lectureGroup.section);
            sections.push(...lectureGroup.compatibleDiscussions);
            sections.push(...lectureGroup.compatibleLabs);
        });
    }

    if (course.standaloneLabs) {
        sections.push(...course.standaloneLabs);
    }

    return sections;
}

/**
 * Extracts only lecture sections from a course
 * @param course - The course to extract lectures from
 * @returns Array of lecture sections only
 */
export function getLectureSections(course: Course): Section[] {
    if (!course.lectures) return [];
    return course.lectures.map(lectureGroup => lectureGroup.section);
}

/**
 * Extracts all lab sections (from lecture groups and standalone)
 * @param course - The course to extract labs from
 * @returns Array of all lab sections
 */
export function getLabSections(course: Course): Section[] {
    const labs: Section[] = [];

    if (course.lectures) {
        course.lectures.forEach(lectureGroup => {
            labs.push(...lectureGroup.compatibleLabs);
        });
    }

    if (course.standaloneLabs) {
        labs.push(...course.standaloneLabs);
    }

    return labs;
}

/**
 * Extracts and formats professors grouped by term for a course
 * @param course - The course to extract professors from
 * @returns Formatted string of professors by term (e.g., "A: Smith | B: Lee, Davis")
 */
export function getProfessorsByTerm(course: Course): string {
    const termProfessors = new Map<string, Set<string>>();

    // Aggregate professors by term across all sections
    const allSections = getAllSections(course);
    allSections.forEach(section => {
        const term = section.computedTerm;

        // Initialize set for this term if not exists
        if (!termProfessors.has(term)) {
            termProfessors.set(term, new Set<string>());
        }

        // Add professors from all periods in this section
        section.periods.forEach(period => {
            if (period.professor &&
                period.professor !== 'TBA' &&
                period.professor !== 'Not Assigned' &&
                period.professor.trim() !== '') {
                termProfessors.get(term)!.add(period.professor);
            }
        });
    });

    // Format output in term order (A, B, C, D)
    const termOrder = ['A', 'B', 'C', 'D'];
    const parts: string[] = [];

    termOrder.forEach(term => {
        const profs = termProfessors.get(term);
        if (profs && profs.size > 0) {
            const profList = Array.from(profs).sort().join(', ');
            parts.push(`${term}: ${profList}`);
        }
    });

    return parts.length > 0 ? parts.join(' | ') : 'No professors listed';
}
