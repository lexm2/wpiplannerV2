import { WorkdaySection } from '../types/workdayTypes.js';
import {
  crnOf,
  isCanceledSection,
} from '../transformers/sectionTransformer.js';

/** "CS 1101" from "CS 1101-AL01 - Introduction To Program Design". */
export function courseCodeOf(section: WorkdaySection): string {
  return section.Course_Section.substring(
    0,
    section.Course_Section.indexOf('-'),
  );
}

/**
 * Workday lists a cross-listed section once per course code under the same
 * CRN, identical but for Course_Section and Course_Title (DS 502 / MA 543,
 * AR 2101 / IMGD 2101). Returns, for a course's sections, the other codes
 * that share any of their CRNs.
 *
 * Co-located sections are a different thing: separate sections, often of
 * different courses or levels (AS 1001-4001, BB 4050 with BB 550), that meet
 * together. Those are each section's meetsWith.
 */
export function indexCrossListings(
  sections: WorkdaySection[],
): (courseSections: WorkdaySection[]) => string[] {
  const codesByCrn = new Map<number, Set<string>>();
  for (const section of sections) {
    if (isCanceledSection(section.Course_Section)) continue;
    const crn = crnOf(section);
    let codes = codesByCrn.get(crn);
    if (!codes) codesByCrn.set(crn, (codes = new Set()));
    codes.add(courseCodeOf(section));
  }

  return courseSections => {
    const own = new Set(courseSections.map(courseCodeOf));
    const others = new Set<string>();
    for (const section of courseSections) {
      for (const code of codesByCrn.get(crnOf(section)) ?? []) {
        if (!own.has(code)) others.add(code);
      }
    }
    return [...others].sort();
  };
}
