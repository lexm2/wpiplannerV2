import { describe, it, expect } from 'vitest';
import {
  getSheetRules,
  getBucketRule,
  getDegreeBucketCriteria,
} from '../../src/services/degree/degreeBucketRules';
import {
  WPI_WIDE_RULES,
  MAJOR_RULES,
  type DegreeBucketRule,
} from '../../src/constants/degreeBucketRules';
import { candidateCodes } from '../../src/services/degree/catalogLookup';

const VALID_CATEGORIES = new Set([
  'total_credits',
  'residency',
  'mqp',
  'mqp_completion',
  'iqp',
  'iqp_completion',
  'hua',
  'hua_completion',
  'social_science',
  'physical_education',
  'major_specific',
  'free_electives',
  'unused',
]);

describe('degreeBucketRules lookup', () => {
  it('merges WPI-wide defaults with the major (major wins on category+label)', () => {
    const rules = getSheetRules('Computer Science', 2030);
    // WPI-wide social_science/hua come through (CS does not override them)
    expect(rules.some(r => r.category === 'social_science')).toBe(true);
    expect(rules.some(r => r.category === 'hua')).toBe(true);
    expect(
      rules.some(
        r =>
          r.category === 'major_specific' && r.validDepartments.includes('CS'),
      ),
    ).toBe(true);
  });

  it('resolves the newest class year <= the requested one', () => {
    // CS science exclusions were added at class 2028; 2026/2027 had none.
    const sci = (year: number) =>
      getSheetRules('Computer Science', year).find(
        r =>
          r.category === 'major_specific' && r.label.includes('BASIC SCIENCE'),
      );
    expect(sci(2027)?.excludedCourses).toEqual([]);
    expect(sci(2029)?.excludedCourses).toContain('RBE 3100');
    expect(sci(2029)?.excludedCourses).toContain('BME 1004');
  });

  it('returns the CS requirement exclusion (CS 2119)', () => {
    const rule = getBucketRule(
      'Computer Science',
      2030,
      'major_specific',
      'Computer Science',
    );
    expect(rule?.validDepartments).toEqual(['CS']);
    expect(rule?.excludedCourses).toContain('CS 2119');
  });

  it('produces filter criteria from a bucket rule', () => {
    const criteria = getDegreeBucketCriteria(
      'Computer Science',
      2030,
      'social_science',
    );
    expect(criteria).not.toBeNull();
    expect(criteria!.allowedDepartments).toContain('ECON');
    expect(criteria!.allowedDepartments).toContain('GOV');
  });

  it('resolves major-specific rules through MAJOR_ALIASES (runtime name -> sheet key)', () => {
    // "Applied Physics" (Workday) aliases to the "Physics Applied" sheet key.
    const aliased = getSheetRules('Applied Physics', 2029).filter(
      r => r.category === 'major_specific',
    );
    const direct = getSheetRules('Physics Applied', 2029).filter(
      r => r.category === 'major_specific',
    );
    expect(aliased.length).toBeGreaterThan(0);
    expect(aliased).toEqual(direct);
  });

  it('returns null for an unknown major + non-shared category', () => {
    expect(
      getDegreeBucketCriteria('Nonexistent Major', 2030, 'major_specific'),
    ).toBeNull();
  });

  it('falls back to WPI-wide for an unknown major on a shared category', () => {
    const criteria = getDegreeBucketCriteria(
      'Nonexistent Major',
      2030,
      'social_science',
    );
    expect(criteria).not.toBeNull();
    expect(criteria!.allowedDepartments.length).toBeGreaterThan(0);
  });
});

describe('degreeBucketRules constants integrity', () => {
  const allRules: DegreeBucketRule[] = [
    ...WPI_WIDE_RULES,
    ...Object.values(MAJOR_RULES).flatMap(byYear =>
      Object.values(byYear).flat(),
    ),
  ];

  it('covers every degree (sanity on scale)', () => {
    expect(Object.keys(MAJOR_RULES).length).toBeGreaterThanOrEqual(35);
  });

  it('every category is a valid RequirementCategory', () => {
    for (const r of allRules)
      expect(VALID_CATEGORIES.has(r.category)).toBe(true);
  });

  it('every department code is uppercase letters (2-5)', () => {
    for (const r of allRules)
      for (const d of r.validDepartments) expect(d).toMatch(/^[A-Z]{2,5}$/);
  });

  it('every excluded course parses to a DEPT NUMBER', () => {
    for (const r of allRules)
      for (const code of r.excludedCourses)
        expect(candidateCodes(code).length).toBeGreaterThan(0);
  });
});
