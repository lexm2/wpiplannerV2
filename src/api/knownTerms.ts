/**
 * WPI terms a search cannot answer from course text alone. The MQP and
 * IQP are degree projects, not catalog sections, so searching "MQP" finds
 * only courses whose descriptions mention it; "HUA" is a requirement, and
 * its name is spelled out in the catalog, never abbreviated. A search
 * naming one gets a line saying what it is, with the catalog courses
 * actually named for it in the year searched, found in the data rather
 * than listed here.
 */
import type { Course } from '../types/types';
import { courseCode } from './serialize';

interface KnownTerm {
  /** The query, lowercased with "&" as "and", names the term. */
  names: RegExp;
  /** Titles of the catalog courses that are about it. */
  titles: RegExp;
  /** What it is, given the courses named for it. */
  note: (named: string[], hasAttribute: boolean) => string;
}

const project = (what: string, named: string[]) =>
  `${what} is a WPI degree project, arranged with a project advisor or department and registered separately, not a regular catalog section. ` +
  (named.length
    ? `Catalog courses named for it: ${named.join('; ')}.`
    : 'No catalog course is named for it; any rows below only mention it.');

const KNOWN_TERMS: KnownTerm[] = [
  {
    names: /\bmqps?\b|\bmajor qualifying projects?\b/,
    titles: /\bmqp\b|major qualifying/i,
    note: named => project('The MQP (Major Qualifying Project)', named),
  },
  {
    names: /\biqps?\b|\binteractive qualifying projects?\b/,
    titles: /\biqp\b|interactive qualifying/i,
    note: named => project('The IQP (Interactive Qualifying Project)', named),
  },
  {
    names: /\bhua\b|\bhumanities and arts (requirement|inquiry|practicum)\b/,
    titles: /^(inquiry seminar|practicum) in humanities/i,
    note: (named, hasAttribute) =>
      [
        'HUA is the Humanities and Arts requirement.',
        hasAttribute
          ? 'Courses that count toward it carry the degree attribute "Humanities and Arts" (filters.degreeAttribute).'
          : '',
        named.length
          ? `Its culminating Inquiry Seminar and Practicum are catalog courses: ${named.join('; ')}.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
  },
];

/** A line for each known term the query names, from `courses` of the year searched. */
export function knownTermNotes(query: string, courses: Course[]): string[] {
  const text = query.toLowerCase().replace(/&/g, ' and ').replace(/\s+/g, ' ');
  const hasAttribute = courses.some(c =>
    c.degreeAttributes.includes('Humanities and Arts'),
  );
  return KNOWN_TERMS.filter(t => t.names.test(text)).map(t => {
    const named = [
      ...new Set(
        courses
          .filter(c => t.titles.test(c.name))
          .map(c => `${courseCode(c)} ${c.name}`),
      ),
    ];
    return t.note(named, hasAttribute);
  });
}
