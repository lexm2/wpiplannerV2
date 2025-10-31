/**
 * Course Utility Functions
 * Helper functions for processing and formatting course data
 */

import { Course } from '../types/types';

/**
 * Extracts and formats professors grouped by term for a course
 * @param course - The course to extract professors from
 * @returns Formatted string of professors by term (e.g., "A: Smith | B: Lee, Davis")
 */
export function getProfessorsByTerm(course: Course): string {
    const termProfessors = new Map<string, Set<string>>();

    // Aggregate professors by term across all sections
    course.sections.forEach(section => {
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
