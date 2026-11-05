import { describe, it, expect } from 'vitest';
import { crossListedTwin } from '../../src/utils/courseUtils';
import type { Course } from '../../src/types/types';

const course = (
  dept: string,
  number: string,
  crossListedWith: string[],
  crn: number,
) =>
  ({
    id: `${dept}-${number}`,
    departmentAbbr: dept,
    number,
    crossListedWith,
    lectures: [
      { section: { crn }, compatibleDiscussions: [], compatibleLabs: [] },
    ],
    standaloneLabs: [],
  }) as unknown as Course;

describe('crossListedTwin', () => {
  const ae = course('AE', '2550', ['PH 2550'], 351963);
  const ph = course('PH', '2550', ['AE 2550'], 351963);

  it('finds the other listing of the same sections', () => {
    expect(crossListedTwin(ph, [ae])).toBe(ae);
  });

  it('ignores a listed course that runs different sections', () => {
    expect(
      crossListedTwin(ph, [course('AE', '2550', ['PH 2550'], 111111)]),
    ).toBeUndefined();
  });

  it('ignores unrelated courses', () => {
    expect(
      crossListedTwin(ph, [course('CS', '1101', [], 351963)]),
    ).toBeUndefined();
  });
});
