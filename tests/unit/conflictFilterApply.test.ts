/**
 * ConflictFilter.apply against the selected sections: a course is never
 * hidden because of its own chosen sections.
 */
import { describe, it, expect } from 'vitest';
import { ConflictFilter } from '../../src/core/filtering/filters/ConflictFilter';
import {
  DayOfWeek,
  PeriodType,
  SectionType,
  type Course,
  type Section,
} from '../../src/types/types';
import { AcademicTerm, type SelectedCourse } from '../../src/types/schedule';
import type { FilterableSection } from '../../src/types/filterableUnit';

let nextCrn = 5000;
function mondayAt10(number: string): Section {
  return {
    crn: nextCrn++,
    number,
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 0,
    computedTerm: AcademicTerm.A,
    periods: [
      {
        type: PeriodType.LECTURE,
        professor: 'Prof X',
        startTime: { hours: 10, minutes: 0 },
        endTime: { hours: 10, minutes: 50 },
        location: 'SH',
        building: 'SH',
        room: '101',
        seats: 30,
        seatsAvailable: 10,
        actualWaitlist: 0,
        maxWaitlist: 0,
        days: new Set([DayOfWeek.MONDAY]),
      },
    ],
  } as Section;
}

function course(id: string, lectures: Section[]): Course {
  return {
    id,
    number: id.replace(/^\D+/, ''),
    name: id,
    description: '',
    departmentAbbr: id.replace(/\d+$/, ''),
    departmentName: '',
    crossListedWith: [],
    degreeAttributes: [],
    courseTypes: [],
    minCredits: 3,
    maxCredits: 3,
    lectures: lectures.map(section => ({
      section,
      compatibleDiscussions: [],
      compatibleLabs: [],
    })),
  };
}

function unit(c: Course, section: Section): FilterableSection {
  return { course: c, section, sectionType: SectionType.LECTURE };
}

describe('ConflictFilter.apply with selected sections', () => {
  const chosen = mondayAt10('AL01');
  const alternative = mondayAt10('AL02');
  const cs2102 = course('CS2102', [chosen, alternative]);
  const otherSection = mondayAt10('AL01');
  const ma1022 = course('MA1022', [otherSection]);

  const selection: SelectedCourse[] = [
    {
      course: cs2102,
      selected: { lecture: chosen },
      isRequired: false,
      lockedSections: new Set(),
    },
  ];
  const result = new ConflictFilter().apply(
    [
      unit(cs2102, chosen),
      unit(cs2102, alternative),
      unit(ma1022, otherSection),
    ],
    { avoidConflicts: true, blockedSlots: [], selectedCourses: selection },
  );
  const kept = result.map(fs => `${fs.course.id} ${fs.section.number}`);

  it('hides other courses that clash with a selected section', () => {
    expect(kept).not.toContain('MA1022 AL01');
  });

  it("keeps a course's alternative sections that overlap its own pick", () => {
    expect(kept).toEqual(['CS2102 AL01', 'CS2102 AL02']);
  });
});
