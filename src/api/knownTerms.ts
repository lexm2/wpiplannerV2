/**
 * WPI terms a search cannot answer from course text alone: the degree
 * projects (degreeProjects.ts), and "HUA", a requirement whose name is spelled
 * out in the catalog, never abbreviated. A search naming one gets a line saying
 * what it is, with the catalog courses actually named for it in the year
 * searched, found in the data rather than listed here.
 */
import type { Course } from '../types/types';
import { degreeProjectNotes } from '../utils/degreeProjects';
import { courseCode } from './serialize';

const HUA_NAMES =
  /\bhua\b|\bhumanities and arts (requirement|inquiry|practicum)\b/;
const HUA_TITLES = /^(inquiry seminar|practicum) in humanities/i;

function huaNote(courses: Course[]): string {
  const hasAttribute = courses.some(c =>
    c.degreeAttributes.includes('Humanities and Arts'),
  );
  const named = [
    ...new Set(
      courses
        .filter(c => HUA_TITLES.test(c.name))
        .map(c => `${courseCode(c)} ${c.name}`),
    ),
  ];
  return [
    'HUA is the Humanities and Arts requirement.',
    hasAttribute
      ? 'Courses that count toward it carry the degree attribute "Humanities and Arts" (filters.degreeAttribute).'
      : '',
    named.length
      ? `Its culminating Inquiry Seminar and Practicum are catalog courses: ${named.join('; ')}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** A line for each known term the query names, from `courses` of the year searched. */
export function knownTermNotes(query: string, courses: Course[]): string[] {
  const text = query.toLowerCase().replace(/&/g, ' and ').replace(/\s+/g, ' ');
  return [
    ...degreeProjectNotes(query, courses),
    ...(HUA_NAMES.test(text) ? [huaNote(courses)] : []),
  ];
}
