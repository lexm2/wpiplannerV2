import type { Course } from '../types/types';

/**
 * The MQP and IQP are degree projects, not catalog sections, so searching
 * "MQP" finds only courses whose descriptions mention it. A search naming one
 * gets a line saying what it is, with the catalog courses actually named for
 * it in the year searched, found in the data rather than listed here.
 */
interface DegreeProject {
  acronym: string;
  /** How a lowercased query writes it. */
  written: RegExp;
  /** Titles of the catalog courses that are about it. */
  titles: RegExp;
  label: string;
}

const PROJECTS: DegreeProject[] = [
  {
    acronym: 'mqp',
    written: /\bmqps?\b|\bmajor qualifying projects?\b/g,
    titles: /\bmqp\b|major qualifying/i,
    label: 'The MQP (Major Qualifying Project)',
  },
  {
    acronym: 'iqp',
    written: /\biqps?\b|\binteractive qualifying projects?\b/g,
    titles: /\biqp\b|interactive qualifying/i,
    label: 'The IQP (Interactive Qualifying Project)',
  },
];

/**
 * A lowercased query with each project written as its acronym, the only way
 * course text writes one: without this "Interactive Qualifying Project" looks
 * for three common words rather than for the IQP.
 */
export const withProjectAcronyms = (text: string) =>
  PROJECTS.reduce((t, p) => t.replace(p.written, p.acronym), text);

/** A line for each project the query names, from `courses` of the year searched. */
export function degreeProjectNotes(query: string, courses: Course[]): string[] {
  const text = query.toLowerCase().replace(/\s+/g, ' ');
  return PROJECTS.filter(p => text.search(p.written) !== -1).map(p => {
    const named = [
      ...new Set(
        courses
          .filter(c => p.titles.test(c.name))
          // The catalog leaves titles like "SOC SCI RES-IQP-" dangling.
          .map(c =>
            `${c.departmentAbbr} ${c.number} ${c.name}`.replace(/[\s-]+$/, ''),
          ),
      ),
    ];
    return (
      `${p.label} is a WPI degree project, arranged with a project advisor or department and registered separately, not a regular catalog section. ` +
      (named.length
        ? `Catalog courses named for it: ${named.join('; ')}.`
        : 'No catalog course is named for it; any rows below only mention it.')
    );
  });
}
