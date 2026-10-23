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

  it('takes each word from the section or the course, whichever has it', () => {
    const robotics = course({
      name: 'Introduction To Robotics',
      description: 'Robots and their sensors.',
    });
    // "lee" only in the instructor, "robotics" and "sensors" only in the
    // course: the course fails at "lee", and the later words still count.
    const section = taught(robotics, 'Ann Lee');
    expect(kept([section], 'lee robotics sensors')).toBe(1);
    expect(kept([section], 'robotics lee sensors')).toBe(1);
    expect(kept([section], 'lee robotics cooking')).toBe(0);
    expect(kept([taught(robotics, 'Bo Chen')], 'lee robotics')).toBe(0);
  });

  it('reads "QX2" as a code on the first search of a new department', () => {
    const qx = (number: string) =>
      course({ id: `QX-${number}`, departmentAbbr: 'QX', number });
    const sections = [
      taught(qx('2001'), 'Ann Lee'),
      taught(qx('3001'), 'Ann Lee'),
    ];
    expect(filter.apply(sections, { query: 'QX2' })).toEqual([sections[0]]);
  });

  describe('rooms', () => {
    const physics = course({
      id: 'AE-3010',
      name: 'Experimentation',
      description: 'Applied physics.',
    });
    const inLabs = taught(physics, 'Ann Lee', {
      location: 'Higgins Labs 216 AE Undergraduate Lab',
    });
    const labSection = taught(physics, 'Ann Lee', {
      type: 'Lab',
      location: 'Olin Hall 107',
    });

    it('ignores common words in room names unless a building is named', () => {
      expect(kept([inLabs], 'physics lab')).toBe(0);
      expect(kept([inLabs], 'physics hall')).toBe(0);
      expect(kept([inLabs], 'physics undergraduate')).toBe(0);
      // A lab section is a lab whatever room it meets in.
      expect(kept([labSection], 'physics lab')).toBe(1);
    });

    it('matches rooms once the query names a building', () => {
      expect(kept([inLabs], 'higgins')).toBe(1);
      expect(kept([inLabs], 'higgins labs')).toBe(1);
      expect(kept([inLabs], 'higgins labs 216')).toBe(1);
      expect(kept([inLabs], 'higgins undergraduate lab')).toBe(1);
      expect(kept([inLabs], 'olin hall')).toBe(0);
    });
  });
});
