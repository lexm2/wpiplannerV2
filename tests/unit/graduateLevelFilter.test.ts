import { describe, it, expect } from 'vitest';
import {
  GraduateLevelFilter,
  courseLevelOf,
} from '../../src/core/filtering/filters/GraduateLevelFilter';
import type { GraduateLevelFilterCriteria } from '../../src/types/filters';
import type { FilterableSection } from '../../src/types/filterableUnit';
import { SectionType, type Course, type Section } from '../../src/types/types';

function fs(number: string, isGraduate = false): FilterableSection {
  const course = {
    id: `CS-${number}-2026`,
    number,
    name: number,
    description: '',
    departmentAbbr: 'CS',
    departmentName: 'CS',
    crossListedWith: [],
    degreeAttributes: [],
    courseTypes: [],
    lectures: [],
    minCredits: 3,
    maxCredits: 3,
    academicYear: 2026,
    isGraduate,
  } as Course;
  return {
    course,
    section: { number: 'A01' } as unknown as Section,
    sectionType: SectionType.LECTURE,
  };
}

const filter = new GraduateLevelFilter();
const numbers = (sections: FilterableSection[]) =>
  sections.map(s => s.course.number);

const sample = [
  fs('1531'),
  fs('174X'),
  fs('2060'),
  fs('3010'),
  fs('3013'),
  fs('4210'),
  fs('504', true),
  fs('6100', true),
];

describe('courseLevelOf', () => {
  it('uses the leading digit', () => {
    expect(courseLevelOf({ number: '3010' })).toBe(3000);
    expect(courseLevelOf({ number: '174X' })).toBe(1000);
    expect(courseLevelOf({ number: '504' })).toBe(5000);
  });
  it('is null when the number does not parse', () => {
    expect(courseLevelOf({ number: 'X100' })).toBeNull();
    expect(courseLevelOf({ number: '' })).toBeNull();
  });
});

describe('GraduateLevelFilter undergradLevel', () => {
  it.each([
    [1000, ['1531', '174X']],
    [2000, ['2060']],
    [3000, ['3010', '3013']],
    [4000, ['4210']],
  ] as const)('keeps only %i-level undergraduate courses', (lvl, expected) => {
    const out = filter.apply(sample, {
      level: 'undergraduate',
      undergradLevel: lvl,
    });
    expect(numbers(out)).toEqual(expected);
  });

  it('keeps every undergraduate course without a sub-level', () => {
    const out = filter.apply(sample, { level: 'undergraduate' });
    expect(numbers(out)).toEqual([
      '1531',
      '174X',
      '2060',
      '3010',
      '3013',
      '4210',
    ]);
  });

  it('ignores undergradLevel for graduate and all', () => {
    expect(
      numbers(
        filter.apply(sample, { level: 'graduate', undergradLevel: 3000 }),
      ),
    ).toEqual(['504', '6100']);
    expect(filter.apply(sample, { level: 'all', undergradLevel: 3000 })).toBe(
      sample,
    );
  });

  it('does not match a specific level when the number does not parse', () => {
    const odd = [fs('ABC')];
    expect(
      filter.apply(odd, { level: 'undergraduate', undergradLevel: 1000 }),
    ).toEqual([]);
    expect(filter.apply(odd, { level: 'undergraduate' })).toHaveLength(1);
  });
});

describe('GraduateLevelFilter criteria', () => {
  it('accepts the optional field', () => {
    expect(filter.isValidCriteria({ level: 'undergraduate' })).toBe(true);
    for (const n of [1000, 2000, 3000, 4000]) {
      expect(
        filter.isValidCriteria({ level: 'undergraduate', undergradLevel: n }),
      ).toBe(true);
    }
  });
  it('rejects anything else', () => {
    for (const bad of [5000, 3500, '3000', null, 0]) {
      expect(
        filter.isValidCriteria({ level: 'undergraduate', undergradLevel: bad }),
      ).toBe(false);
    }
    expect(filter.isValidCriteria({ level: 'nope' })).toBe(false);
  });
  it('describes the criteria', () => {
    const d = (c: GraduateLevelFilterCriteria) => filter.getDisplayValue(c);
    expect(d({ level: 'undergraduate' })).toBe('Undergraduate Only');
    expect(d({ level: 'undergraduate', undergradLevel: 3000 })).toBe(
      'Undergraduate Only - 3000 level',
    );
    expect(d({ level: 'graduate' })).toBe('Graduate Only');
    expect(d({ level: 'all' })).toBe('All Levels');
  });
});
