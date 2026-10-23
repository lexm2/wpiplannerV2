import type { FilterableSection } from '../../types/filterableUnit';

/**
 * The unit a student signs up for as a whole: a lecture with the labs and
 * discussions listed under it, or a standalone lab on its own.
 */
function groupOf(fs: FilterableSection): object {
  return fs.lectureGroup ?? fs.section;
}

/**
 * Keeps every section of each lecture group that has at least one section
 * passing `matches`, and drops the other groups whole.
 *
 * Filters that ask about a course or its instructor go through this rather
 * than judging each section alone. A section-by-section test fails a group's
 * labs whenever the match is on the lecture (MA 1021's Kidwell lectures have
 * TA-run labs), and SectionFilterPipeline.reconstructCourses then drops the
 * lecture for having no labs left. Filters on something each attended
 * section must satisfy (times, seats, term, conflicts) stay per section.
 */
export function keepMatchingGroups(
  sections: FilterableSection[],
  matches: (fs: FilterableSection) => boolean,
): FilterableSection[] {
  const matched = new Set<object>();
  for (const fs of sections) {
    const group = groupOf(fs);
    if (!matched.has(group) && matches(fs)) matched.add(group);
  }
  return sections.filter(fs => matched.has(groupOf(fs)));
}
