import { describe, it, expect } from 'vitest';
import { buildCourseView } from '../../src/svelte/courseView';
import type { Course, Section } from '../../src/types/types';

let nextCrn = 9000;
function section(number: string, computedTerm: string): Section {
  return {
    crn: nextCrn++,
    number,
    seats: 20,
    seatsAvailable: 5,
    actualWaitlist: 0,
    maxWaitlist: 0,
    computedTerm,
    periods: [],
  } as unknown as Section;
}

function course(id: string, sections: Section[]): Course {
  return {
    id,
    number: id,
    name: id,
    description: '',
    departmentAbbr: 'AE',
    departmentName: '',
    minCredits: 3,
    maxCredits: 3,
    lectures: sections.map(s => ({
      section: s,
      compatibleDiscussions: [],
      compatibleLabs: [],
    })),
  };
}

const available = (c: Course) =>
  buildCourseView(c)
    .terms.filter(t => t.available)
    .map(t => t.term);

describe('buildCourseView terms', () => {
  it('offers a semester-only course its F badge', () => {
    // A course taught only as a fall semester section used to show no term
    // badges at all, so its sections could not be opened from the list.
    const ae601 = course('AE601', [section('F01', 'F')]);
    expect(available(ae601)).toEqual(['F']);
    expect(buildCourseView(ae601).sectionsByTerm.get('F')?.badges).toHaveLength(
      1,
    );
  });

  it('lists quarters before semesters', () => {
    const mixed = course('MIX1', [
      section('S01', 'S'),
      section('C01', 'C'),
      section('F01', 'F'),
      section('A01', 'A'),
    ]);
    expect(available(mixed)).toEqual(['A', 'C', 'F', 'S']);
  });

  it('gives a quarter-only course its four quarter badges and no semester ones', () => {
    // Unavailable quarters still show (greyed), so rows line up; semester
    // badges appear only on courses that offer them.
    const q = course('Q1', [section('A01', 'A'), section('B01', 'B')]);
    expect(available(q)).toEqual(['A', 'B']);
    expect(buildCourseView(q).terms.map(t => t.term)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
  });
});
