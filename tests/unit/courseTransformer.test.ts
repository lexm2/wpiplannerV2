/**
 * Course-level conversion: how transformCourse groups a course-year's Workday
 * rows into lecture groups and what it derives from them.
 */
import { describe, it, expect } from 'vitest';
import { transformCourse } from '../../scripts/converter/transformers/courseTransformer';
import { converterConfig } from '../../scripts/converter.config';
import type { WorkdaySection } from '../../scripts/converter/types/workdayTypes';

let nextCrn = 350000;

function row(
  courseSection: string,
  overrides: Partial<WorkdaySection> = {},
): WorkdaySection {
  const crn = nextCrn++;
  return {
    Academic_Level: 'Undergraduate',
    Academic_Year: '2026 - 2027 Academic Year',
    Course_Description: '',
    Course_Section: courseSection,
    Course_Section_Description: '<p>A course.</p>',
    Course_Section_Start_Date: '2026-08-27',
    Course_Section_End_Date: '2026-10-14',
    Course_Tags: 'Offering Pattern :: Category I',
    Course_Title: 'MA 1022 - Calculus II',
    Credits: '3',
    Delivery_Mode: 'In-Person',
    Enrolled_Capacity: '10/20',
    Instructional_Format: 'Lecture',
    Instructors: 'Jane Doe',
    Offering_Period: '2026 Fall A Term',
    Section_Details: 'Fuller Labs 311 | M-T-R-F | 9:00 AM - 9:50 AM',
    Section_Status: 'Open',
    Waitlist_Waitlist_Capacity: '0/9',
    cour_sec_def_referenceID: `COURSE_SECTION_DEFINITION-3-${crn}`,
    ...overrides,
  } as WorkdaySection;
}

const lab = (courseSection: string, overrides: Partial<WorkdaySection> = {}) =>
  row(courseSection, {
    Instructional_Format: 'Laboratory',
    Section_Details: 'Stratton Hall 202 | W | 2:00 PM - 2:50 PM',
    ...overrides,
  });

const convert = (rows: WorkdaySection[]) =>
  transformCourse(rows, 'MA', converterConfig);

describe('lecture groups', () => {
  it('lists only the companions from the lecture term', () => {
    // Plain labs carry no cluster, so the cluster rule alone pairs them
    // with every lecture in the academic year.
    const course = convert([
      row('MA 1022-AL01 - Calculus II'),
      lab('MA 1022-AX01 - Calculus II'),
      row('MA 1022-BL01 - Calculus II', {
        Offering_Period: '2026 Fall B Term',
      }),
      lab('MA 1022-BX01 - Calculus II', {
        Offering_Period: '2026 Fall B Term',
      }),
      lab('MA 1022-BX02 - Calculus II', {
        Offering_Period: '2026 Fall B Term',
      }),
    ]);

    const labsOf = (number: string) =>
      course.lectures
        .find(g => g.section.number === number)!
        .compatibleLabs.map(l => l.number);
    expect(labsOf('AL01')).toEqual(['AX01']);
    expect(labsOf('BL01')).toEqual(['BX01', 'BX02']);
  });

  it('still pairs any same-term lab with any lecture when none is clustered', () => {
    const course = convert([
      row('MA 1022-AL01 - Calculus II'),
      row('MA 1022-AL02 - Calculus II', {
        Section_Details: 'Fuller Labs 311 | M-T-R-F | 11:00 AM - 11:50 AM',
      }),
      lab('MA 1022-AX01 - Calculus II'),
      lab('MA 1022-AX02 - Calculus II'),
    ]);

    for (const group of course.lectures) {
      expect(group.compatibleLabs.map(l => l.number)).toEqual(['AX01', 'AX02']);
    }
  });
});
