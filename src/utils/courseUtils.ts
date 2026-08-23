import {
  COMPONENT_KINDS,
  Course,
  Section,
  type SectionsByKind,
} from '../types/types';
import type { SelectedCourse } from '../types/schedule';

const EXCLUDED_PROFESSORS = new Set(['TBA', 'Not Assigned', '']);

/** Flattens the hierarchical lecture structure into a flat array of all sections. */
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

export function getLectureSections(course: Course): Section[] {
  if (!course.lectures) return [];
  return course.lectures.map(lectureGroup => lectureGroup.section);
}

/** Returns all lab sections, both from lecture groups and standalone. */
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

/** Formats professors grouped by term, e.g. "A: Smith | B: Lee, Davis". */
export function getProfessorsByTerm(course: Course): string {
  const termProfessors = new Map<string, Set<string>>();

  const allSections = getAllSections(course);
  allSections.forEach(section => {
    const term = section.computedTerm;

    if (!termProfessors.has(term)) {
      termProfessors.set(term, new Set<string>());
    }

    section.periods.forEach(period => {
      if (
        period.professor &&
        !EXCLUDED_PROFESSORS.has(period.professor) &&
        period.professor.trim() !== ''
      ) {
        const termSet = termProfessors.get(term);
        if (termSet) {
          termSet.add(period.professor);
        }
      }
    });
  });

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

/**
 * The sections a selection holds, in canonical kind order.
 *
 * Always reach for this rather than Object.values(): a plain object iterates in
 * insertion order, and selections are not always built lecture-first.
 */
export function sectionsOf(selected: SectionsByKind): Section[] {
  return COMPONENT_KINDS.map(kind => selected[kind]).filter(
    (s): s is Section => s != null,
  );
}

/** The sections a course has selected, in canonical kind order. */
export function getSelectedSections(course: SelectedCourse): Section[] {
  return sectionsOf(course.selected);
}

/**
 * Encodes a selection for export as [courseId, lectureCRN, discussionCRN, labCRN].
 *
 * The tuple order is a wire contract for exported .json files, independent of
 * COMPONENT_KINDS - reordering the kinds must not reorder these positions, and
 * widening the tuple breaks the stride-4 decode in ApplicationState along with
 * every file a user has already saved.
 */
export function encodeCourseSelection(
  course: SelectedCourse,
): [string, string | null, string | null, string | null] {
  return [
    course.course.id,
    course.selected.lecture?.crn?.toString() ?? null,
    course.selected.discussion?.crn?.toString() ?? null,
    course.selected.lab?.crn?.toString() ?? null,
  ];
}

/** Resolves exported CRNs back to section objects from the catalog course. */
export function decodeCourseSelection(
  lectureCRN: string | null,
  discussionCRN: string | null,
  labCRN: string | null,
  course: Course,
): SectionsByKind {
  const lecture = lectureCRN ? findSectionByCRN(course, lectureCRN) : null;
  const discussion = discussionCRN
    ? findSectionByCRN(course, discussionCRN)
    : null;
  const lab = labCRN ? findSectionByCRN(course, labCRN) : null;

  return {
    ...(lecture && { lecture }),
    ...(discussion && { discussion }),
    ...(lab && { lab }),
  };
}

function findSectionByCRN(course: Course, crn: string): Section | null {
  const allSections = getAllSections(course);
  return allSections.find(s => s.crn.toString() === crn) || null;
}
