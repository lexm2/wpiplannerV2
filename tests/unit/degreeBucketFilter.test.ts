import { describe, it, expect } from 'vitest';
import { DegreeBucketFilter } from '../../src/core/filtering/filters/DegreeBucketFilter';
import type { DegreeBucketFilterCriteria } from '../../src/types/filters';
import type { FilterableSection } from '../../src/types/filterableUnit';
import { SectionType, type Course, type Section } from '../../src/types/types';

function course(dept: string, number: string): Course {
  return {
    id: `${dept}-${number}-2026`,
    number,
    name: `${dept} ${number}`,
    description: '',
    departmentAbbr: dept,
    departmentName: dept,
    lectures: [],
    minCredits: 3,
    maxCredits: 3,
    academicYear: 2026,
  };
}

function fs(dept: string, number: string): FilterableSection {
  return {
    course: course(dept, number),
    section: { number: 'A01' } as unknown as Section,
    sectionType: SectionType.LECTURE,
  };
}

const filter = new DegreeBucketFilter();
const codes = (sections: FilterableSection[]) =>
  sections.map(s => `${s.course.departmentAbbr} ${s.course.number}`);

describe('DegreeBucketFilter', () => {
  const sample = [
    fs('CS', '3013'),
    fs('CS', '2119'),
    fs('MA', '1021'),
    fs('BME', '1004'),
  ];

  it('passes through when both lists are empty', () => {
    const c: DegreeBucketFilterCriteria = {
      allowedDepartments: [],
      excludedCourses: [],
    };
    expect(filter.apply(sample, c)).toBe(sample);
  });

  it('drops sections whose department is not allowed', () => {
    const c: DegreeBucketFilterCriteria = {
      allowedDepartments: ['CS'],
      excludedCourses: [],
    };
    expect(codes(filter.apply(sample, c))).toEqual(['CS 3013', 'CS 2119']);
  });

  it('drops an excluded course even when its department is allowed', () => {
    const c: DegreeBucketFilterCriteria = {
      allowedDepartments: ['CS'],
      excludedCourses: ['CS 2119'],
    };
    expect(codes(filter.apply(sample, c))).toEqual(['CS 3013']);
  });

  it('applies exclusions with no department restriction', () => {
    const c: DegreeBucketFilterCriteria = {
      allowedDepartments: [],
      excludedCourses: ['BME 1004'],
    };
    expect(codes(filter.apply(sample, c))).toEqual([
      'CS 3013',
      'CS 2119',
      'MA 1021',
    ]);
  });

  it('expands cross-listed excluded entries to both identities', () => {
    const sections = [fs('CS', '2022'), fs('MA', '2201'), fs('CS', '3013')];
    const c: DegreeBucketFilterCriteria = {
      allowedDepartments: [],
      excludedCourses: ['CS 2022/ MA 2201'],
    };
    expect(codes(filter.apply(sections, c))).toEqual(['CS 3013']);
  });

  it('matches departments case-insensitively', () => {
    const sections = [fs('cs', '3013'), fs('Ma', '1021')];
    const c: DegreeBucketFilterCriteria = {
      allowedDepartments: ['CS'],
      excludedCourses: [],
    };
    expect(codes(filter.apply(sections, c))).toEqual(['cs 3013']);
  });

  it('isValidCriteria accepts well-formed and rejects malformed input', () => {
    expect(
      filter.isValidCriteria({
        allowedDepartments: ['CS'],
        excludedCourses: [],
      }),
    ).toBe(true);
    expect(
      filter.isValidCriteria({ allowedDepartments: 'CS', excludedCourses: [] }),
    ).toBe(false);
    expect(
      filter.isValidCriteria({ allowedDepartments: [1], excludedCourses: [] }),
    ).toBe(false);
    expect(filter.isValidCriteria(null)).toBe(false);
  });

  it('getDisplayValue summarizes the bucket', () => {
    expect(
      filter.getDisplayValue({
        allowedDepartments: ['CS', 'MA'],
        excludedCourses: ['CS 2119'],
        label: 'CS',
      }),
    ).toBe('CS: 2 dept(s), 1 excluded');
  });
});
