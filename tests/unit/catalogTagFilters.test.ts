/**
 * The filters built on catalog fields phase 1 added: degree attribute,
 * delivery mode, course level and offering pattern, plus the waitlist bound
 * on availability and the rating-count bound on Rate My Professor.
 */
import { describe, it, expect } from 'vitest';
import { SectionFilterPipeline } from '../../src/core/filtering/SectionFilterPipeline';
import { DegreeAttributeFilter } from '../../src/core/filtering/filters/DegreeAttributeFilter';
import { DeliveryModeFilter } from '../../src/core/filtering/filters/DeliveryModeFilter';
import { CourseLevelRangeFilter } from '../../src/core/filtering/filters/CourseLevelRangeFilter';
import { OfferingPatternFilter } from '../../src/core/filtering/filters/OfferingPatternFilter';
import { AvailabilityFilter } from '../../src/core/filtering/filters/AvailabilityFilter';
import { RMPRatingFilter } from '../../src/core/filtering/filters/RMPRatingFilter';
import type { RateMyProfessorService } from '../../src/services/external/RateMyProfessorService';
import type { Course, Section } from '../../src/types/types';
import { PeriodType } from '../../src/types/types';
import { AcademicTerm } from '../../src/types/schedule';

function section(crn: number, over: Partial<Section> = {}): Section {
  return {
    crn,
    number: `A${crn}`,
    seats: 30,
    seatsAvailable: 5,
    actualWaitlist: 0,
    maxWaitlist: 10,
    meetsWith: [],
    isOnlineGrad: false,
    deliveryMode: 'In-Person',
    status: 'Open',
    startDate: '',
    endDate: '',
    computedTerm: AcademicTerm.A,
    periods: [
      {
        type: PeriodType.LECTURE,
        professor: crn % 2 ? 'Ada Lovelace' : 'Few Ratings',
      } as Section['periods'][number],
    ],
    ...over,
  };
}

function course(
  id: string,
  over: Partial<Course>,
  sections: Section[],
): Course {
  const [dept, number] = id.split(' ');
  return {
    id: `${dept}-${number}-2026`,
    number,
    name: id,
    description: '',
    departmentAbbr: dept,
    departmentName: dept,
    crossListedWith: [],
    degreeAttributes: [],
    courseTypes: [],
    minCredits: 3,
    maxCredits: 3,
    lectures: sections.map(s => ({
      section: s,
      compatibleDiscussions: [],
      compatibleLabs: [],
    })),
    ...over,
  };
}

const courses = [
  course('PSY 1400', { degreeAttributes: ['Social Sciences'], category: 1 }, [
    section(1, { deliveryMode: 'Online', actualWaitlist: 4 }),
  ]),
  course(
    'HU 3900',
    { degreeAttributes: ['Humanities and Arts'], category: 2 },
    [section(2, { deliveryMode: 'Hybrid' }), section(3)],
  ),
  course('DS 502', { category: null }, [section(5, { actualWaitlist: 12 })]),
];

const rmp = {
  getRatings: (name: string) =>
    name === 'Ada Lovelace'
      ? { rating: 4.5, difficulty: 2, numRatings: 12, wouldTakeAgain: 90 }
      : { rating: 4.8, difficulty: 2, numRatings: 2, wouldTakeAgain: 90 },
} as unknown as RateMyProfessorService;

function run(
  filter:
    | DegreeAttributeFilter
    | DeliveryModeFilter
    | CourseLevelRangeFilter
    | OfferingPatternFilter
    | AvailabilityFilter
    | RMPRatingFilter,
  criteria: unknown,
) {
  expect(filter.isValidCriteria(criteria)).toBe(true);
  const pipeline = new SectionFilterPipeline();
  pipeline.registerFilter(filter);
  const kept = pipeline.applyFilters(
    pipeline.flattenCoursesToSections(courses),
    new Map([[filter.id, criteria]]),
  );
  return kept.map(fs => fs.section.crn);
}

describe('DegreeAttributeFilter', () => {
  it('keeps courses with any of the attributes, ignoring case', () => {
    const filter = new DegreeAttributeFilter();
    expect(run(filter, { attributes: ['social sciences'] })).toEqual([1]);
    expect(
      run(filter, { attributes: ['Social Sciences', 'Humanities and Arts'] }),
    ).toEqual([1, 2, 3]);
  });
});

describe('DeliveryModeFilter', () => {
  it('judges each section by its own mode', () => {
    const filter = new DeliveryModeFilter();
    expect(run(filter, { modes: ['in-person'] })).toEqual([3, 5]);
    expect(run(filter, { modes: ['Online', 'Hybrid'] })).toEqual([1, 2]);
  });
});

describe('CourseLevelRangeFilter', () => {
  it('reads the first digit of three- and four-digit numbers alike', () => {
    const filter = new CourseLevelRangeFilter();
    expect(run(filter, { min: 5 })).toEqual([5]);
    expect(run(filter, { max: 1 })).toEqual([1]);
    expect(run(filter, { min: 2, max: 4 })).toEqual([2, 3]);
    expect(filter.isValidCriteria({ min: 10 })).toBe(false);
  });
});

describe('OfferingPatternFilter', () => {
  it('keeps the categories asked for, and unknown ones only on request', () => {
    const filter = new OfferingPatternFilter();
    expect(run(filter, { categories: [1] })).toEqual([1]);
    expect(run(filter, { categories: [2], includeUnknown: true })).toEqual([
      2, 3, 5,
    ]);
    expect(filter.isValidCriteria({ categories: [4] })).toBe(false);
  });
});

describe('AvailabilityFilter maxWaitlisted', () => {
  it('drops sections with a longer waitlist', () => {
    const filter = new AvailabilityFilter();
    expect(run(filter, { availableOnly: false, maxWaitlisted: 4 })).toEqual([
      1, 2, 3,
    ]);
    expect(run(filter, { availableOnly: false, maxWaitlisted: 0 })).toEqual([
      2, 3,
    ]);
    expect(
      filter.getDisplayValue({ availableOnly: true, maxWaitlisted: 0 }),
    ).toBe('Available seats only, Waitlist at most 0');
  });
});

describe('RMPRatingFilter minNumRatings', () => {
  it('treats a rating resting on too few reviews as no data', () => {
    const filter = new RMPRatingFilter(rmp);
    // Section 2 is taught by "Few Ratings" (2 reviews).
    expect(
      run(filter, {
        minRating: 4,
        minNumRatings: 5,
        includeWithoutData: false,
      }),
    ).toEqual([1, 3, 5]);
    expect(run(filter, { minRating: 4, minNumRatings: 5 })).toEqual([
      1, 2, 3, 5,
    ]);
  });
});
