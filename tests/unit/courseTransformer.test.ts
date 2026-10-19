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

describe('credits', () => {
  const interestList = (courseSection: string) =>
    row(courseSection, {
      Credits: '0',
      Course_Tags: 'Course Type :: Waitlist Section',
      Section_Status: 'Waitlist',
      Enrolled_Capacity: '0/0',
    });

  it('ignores interest lists listed at 0 credits', () => {
    const course = convert([
      interestList('CS 1101-AL-Interest List - Introduction To Program Design'),
      row('CS 1101-AL01 - Introduction To Program Design'),
    ]);
    expect([course.minCredits, course.maxCredits]).toEqual([3, 3]);
  });

  it('spans the credits the sections offer', () => {
    const course = convert([
      row('MU 2401-F01 - Glee Club', { Credits: '1.5' }),
      row('MU 2401-F02 - Glee Club', { Credits: '0' }),
    ]);
    expect([course.minCredits, course.maxCredits]).toEqual([0, 1.5]);
  });

  it('falls back to the interest lists when nothing else is offered', () => {
    const course = convert([
      { ...interestList('PH 1111-AL-Interest List - Mechanics'), Credits: '3' },
    ]);
    expect([course.minCredits, course.maxCredits]).toEqual([3, 3]);
  });
});

describe('credits from the lecture', () => {
  it('takes no notice of a mislabeled companion', () => {
    const course = convert([
      row('PH 1110-AL01 - General Physics'),
      lab('PH 1110-AX01 - General Physics', { Credits: '0' }),
    ]);
    expect([course.minCredits, course.maxCredits]).toEqual([3, 3]);
  });

  it('uses the labs of a lab-only course', () => {
    const course = convert([lab('CH 1010-AX01 - Chemistry', { Credits: '1' })]);
    expect([course.minCredits, course.maxCredits]).toEqual([1, 1]);
  });
});

describe('section details', () => {
  it('carries delivery mode, status and dates', () => {
    const [group] = convert([
      row('CS 1101-AL01 - Introduction To Program Design', {
        Delivery_Mode: 'Hybrid',
        Section_Status: 'Waitlist',
      }),
    ]).lectures;
    expect(group.section).toMatchObject({
      deliveryMode: 'Hybrid',
      status: 'Waitlist',
      startDate: '2026-08-27',
      endDate: '2026-10-14',
    });
  });
});

describe('course tags', () => {
  it('reads degree attributes and course types across the sections', () => {
    const course = convert([
      row('HU 3900-A01 - Inquiry Seminar', {
        Course_Tags:
          'Degree Attribute :: Humanities and Arts; Course Type :: Music; Offering Pattern :: Category II',
      }),
      row('HU 3900-A02 - Inquiry Seminar', {
        Course_Tags:
          'Degree Attribute :: Humanities and Arts; Course Type :: Art; Offering Pattern :: Category II',
      }),
    ]);
    expect(course.degreeAttributes).toEqual(['Humanities and Arts']);
    expect(course.courseTypes).toEqual(['Music', 'Art']);
    expect(course.category).toBe(2);
  });

  it('leaves the interest-list marker out of the course types', () => {
    const course = convert([
      row('CS 1101-AL-Interest List - Intro', {
        Course_Tags:
          'Course Type :: Waitlist Section; Offering Pattern :: Category I',
      }),
      row('CS 1101-AL01 - Intro'),
    ]);
    expect(course.courseTypes).toEqual([]);
  });

  it('falls back to the description for the category', () => {
    const course = convert([
      row('MA 540-F01 - Probability', {
        Course_Tags: '',
        Course_Section_Description: '<p>Cat. III</p><p>Probability.</p>',
      }),
    ]);
    expect(course.category).toBe(3);
  });

  it('prefers the tag when the description disagrees', () => {
    const course = convert([
      row('MA 540-F01 - Probability', {
        Course_Section_Description: '<p>Cat. II</p><p>Probability.</p>',
      }),
    ]);
    expect(course.category).toBe(1);
  });

  it('flags online graduate sections', () => {
    const [online, campus] = convert([
      row('AE 5131-F01 - Aerodynamics', {
        Course_Tags: 'Graduate Studies Online :: Online Grad Course',
      }),
      row('AE 5131-F02 - Aerodynamics', { Course_Tags: '' }),
    ]).lectures;
    expect(online.section.isOnlineGrad).toBe(true);
    expect(campus.section.isOnlineGrad).toBe(false);
  });
});
