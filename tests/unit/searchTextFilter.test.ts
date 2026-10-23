/**
 * SearchTextFilter: words matched against the course and each section's own
 * text (instructors, rooms), accents aside.
 */
import { describe, it, expect } from 'vitest';
import { SearchTextFilter } from '../../src/core/filtering/filters/SearchTextFilter';
import type { FilterableSection } from '../../src/types/filterableUnit';
import type { Course, Period, Section } from '../../src/types/types';

function course(over: Partial<Course> = {}): Course {
  return {
    id: 'HI-1001-2026',
    number: '1001',
    name: 'Introduction to History',
    description: 'Sources and arguments.',
    departmentAbbr: 'HI',
    departmentName: 'History',
    degreeAttributes: [],
    courseTypes: [],
    crossListedWith: [],
    minCredits: 3,
    maxCredits: 3,
    ...over,
  };
}

function taught(
  c: Course,
  professor: string,
  where: Partial<Period> = {},
): FilterableSection {
  const section = {
    crn: 1,
    number: 'A01',
    periods: [{ professor, type: 'Lecture', ...where }],
  } as unknown as Section;
  return { course: c, section } as unknown as FilterableSection;
}

const filter = new SearchTextFilter();
const kept = (
  sections: FilterableSection[],
  query: string,
  professorOnly = false,
) => filter.apply(sections, { query, professorOnly }).length;

describe('SearchTextFilter', () => {
  it('finds accented instructor names typed without accents, and back', () => {
    const neel = taught(course(), 'EJ Néel');
    const martin = taught(
      course({ id: 'B' }),
      'Marja Bakermans; William San Martín',
    );
    expect(kept([neel], 'Neel', true)).toBe(1);
    expect(kept([neel], 'neel')).toBe(1);
    expect(kept([martin], 'Martin', true)).toBe(1);
    expect(kept([martin], 'san martin')).toBe(1);
    const plain = taught(course({ id: 'C' }), 'Karl-Frederic Vieux');
    expect(kept([plain], 'Frédéric', true)).toBe(1);
    expect(kept([plain], 'Frédéric')).toBe(1);
  });

  it('finds accented course text typed without accents', () => {
    const c = course({ name: 'Le Cinéma Français', description: 'Films.' });
    expect(kept([taught(c, 'Ann Lee')], 'cinema francais')).toBe(1);
    expect(kept([taught(course(), 'Ann Lee')], 'cinéma')).toBe(0);
  });
});
