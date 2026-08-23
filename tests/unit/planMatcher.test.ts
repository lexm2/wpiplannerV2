import { describe, it, expect } from 'vitest';
import { matchPlannedCourses } from '../../src/services/degree/planMatcher';
import { academicYearForPeriod } from '../../src/services/degree/catalogLookup';
import { AcademicTerm } from '../../src/types/schedule';
import type {
  Course,
  Department,
  Section,
  LectureGroup,
} from '../../src/types/types';
import type { AppliedCourse, StudentRecord } from '../../src/types/degree';

// --- builders ---------------------------------------------------------------

let crn = 1000;
function section(term: string): Section {
  return {
    crn: crn++,
    number: `${term}01`,
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 0,
    computedTerm: term as AcademicTerm,
    periods: [],
  };
}

function group(term: string, discussions = 0, labs = 0): LectureGroup {
  return {
    section: section(term),
    compatibleDiscussions: Array.from({ length: discussions }, () =>
      section(term),
    ),
    compatibleLabs: Array.from({ length: labs }, () => section(term)),
  };
}

function course(
  dept: string,
  number: string,
  ay: number,
  groups: LectureGroup[],
): Course {
  return {
    id: `${dept}-${number}-${ay}`,
    number,
    name: `${dept} ${number}`,
    description: '',
    departmentAbbr: dept,
    departmentName: dept,
    lectures: groups,
    minCredits: 3,
    maxCredits: 3,
    academicYear: ay,
  };
}

function departments(...courses: Course[]): Department[] {
  const byDept = new Map<string, Course[]>();
  for (const c of courses) {
    if (!byDept.has(c.departmentAbbr)) byDept.set(c.departmentAbbr, []);
    byDept.get(c.departmentAbbr)!.push(c);
  }
  return [...byDept].map(([abbreviation, cs]) => ({
    abbreviation,
    name: abbreviation,
    courses: cs,
  }));
}

function planned(
  code: string,
  year: number,
  season: 'Fall' | 'Spring',
  term: string | null,
): AppliedCourse {
  const [department, number] = code.split('/')[0].trim().split(' ');
  return {
    code,
    department,
    number,
    title: code,
    credits: 3,
    grade: null,
    isTransfer: false,
    isInProgress: true,
    period: {
      year,
      season,
      term,
      raw: `${year} ${season} ${term ?? 'Semester'}`,
    },
    satisfies: [],
  };
}

function record(courses: AppliedCourse[]): StudentRecord {
  return {
    schemaVersion: 1,
    major: 'CS',
    degree: 'BS',
    startYear: 2025,
    importedAt: 'x',
    requirements: [],
    courses,
    credits: { earned: 0, inProgress: 0, transfer: 0, required: null },
  };
}

// --- helper unit tests ------------------------------------------------------

describe('academicYearForPeriod', () => {
  it('Fall keeps the calendar year', () => {
    expect(
      academicYearForPeriod({ year: 2026, season: 'Fall', term: 'A', raw: '' }),
    ).toBe(2026);
  });
  it('Spring maps to the previous fall year', () => {
    expect(
      academicYearForPeriod({
        year: 2027,
        season: 'Spring',
        term: 'D',
        raw: '',
      }),
    ).toBe(2026);
  });
  it('null period -> null', () => {
    expect(academicYearForPeriod(null)).toBeNull();
  });
});

// --- matcher ----------------------------------------------------------------

describe('matchPlannedCourses', () => {
  it('auto-selects the section when the planned term has exactly one lecture group', () => {
    const depts = departments(course('CS', '2223', 2026, [group('B', 1)]));
    const res = matchPlannedCourses(
      record([planned('CS 2223', 2026, 'Fall', 'B')]),
      depts,
    );

    expect(res.stats).toMatchObject({
      matched: 1,
      autoSectioned: 1,
      pinnedOnly: 0,
      unmatched: [],
    });
    const sc = res.selections[0];
    expect(sc.isRequired).toBe(true);
    expect(sc.allowedTerms).toEqual(['B']);
    expect(sc.selected.lecture).toBeDefined();
    expect(sc.selected.discussion).toBeDefined(); // single compatible discussion -> auto-picked
    expect(res.year).toBe(2026);
  });

  it('pins the term but leaves the section empty when the term is ambiguous', () => {
    const depts = departments(
      course('CS', '2022', 2026, [group('A'), group('A')]),
    );
    const res = matchPlannedCourses(
      record([planned('CS 2022/ MA 2201', 2026, 'Fall', 'A')]),
      depts,
    );

    expect(res.stats).toMatchObject({
      matched: 1,
      autoSectioned: 0,
      pinnedOnly: 1,
    });
    expect(res.selections[0].allowedTerms).toEqual(['A']);
    expect(res.selections[0].selected.lecture).toBeUndefined();
  });

  it('falls back to the cross-listed alternate code', () => {
    const depts = departments(course('MA', '2201', 2026, [group('A')]));
    const res = matchPlannedCourses(
      record([planned('CS 2022/ MA 2201', 2026, 'Fall', 'A')]),
      depts,
    );
    expect(res.stats.matched).toBe(1);
    expect(res.selections[0].course.id).toBe('MA-2201-2026');
  });

  it('maps Spring terms to the previous fall academic year', () => {
    const depts = departments(course('CS', '4341', 2026, [group('D')]));
    const res = matchPlannedCourses(
      record([planned('CS 4341', 2027, 'Spring', 'D')]),
      depts,
    );
    expect(res.stats).toMatchObject({ matched: 1, autoSectioned: 1 });
    expect(res.year).toBe(2026);
  });

  it('reports courses absent from the catalog as unmatched', () => {
    const depts = departments(course('CS', '2223', 2026, [group('B')]));
    const res = matchPlannedCourses(
      record([planned('CS 9999', 2026, 'Fall', 'B')]),
      depts,
    );
    expect(res.stats.matched).toBe(0);
    expect(res.stats.unmatched).toEqual(['CS 9999']);
  });

  it('ignores completed/transfer courses (only planned are matched)', () => {
    const depts = departments(course('CS', '2223', 2026, [group('B')]));
    const completed: AppliedCourse = {
      ...planned('CS 2223', 2026, 'Fall', 'B'),
      isInProgress: false,
      grade: 'A',
    };
    const res = matchPlannedCourses(record([completed]), depts);
    expect(res.stats.matched).toBe(0);
    expect(res.selections).toHaveLength(0);
  });
});
