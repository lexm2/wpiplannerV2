/**
 * Instructor and text filters judge a lecture group as a whole, so a match on
 * the lecture keeps the labs a TA runs, and the pipeline's rule that a group
 * needs one of each companion kind stays intact for the per-section filters.
 */
import { describe, it, expect } from 'vitest';
import { SectionFilterPipeline } from '../../src/core/filtering/SectionFilterPipeline';
import { SearchTextFilter } from '../../src/core/filtering/filters/SearchTextFilter';
import { RMPRatingFilter } from '../../src/core/filtering/filters/RMPRatingFilter';
import { AvailabilityFilter } from '../../src/core/filtering/filters/AvailabilityFilter';
import type { RateMyProfessorService } from '../../src/services/external/RateMyProfessorService';
import type { Course, Section } from '../../src/types/types';
import { PeriodType } from '../../src/types/types';
import { AcademicTerm } from '../../src/types/schedule';

function section(
  crn: number,
  number: string,
  type: PeriodType,
  instructors: string[],
  seatsAvailable = 5,
): Section {
  return {
    crn,
    number,
    seats: 30,
    seatsAvailable,
    actualWaitlist: 0,
    maxWaitlist: 0,
    meetsWith: [],
    isOnlineGrad: false,
    deliveryMode: 'In-Person',
    status: 'Open',
    startDate: '',
    endDate: '',
    computedTerm: AcademicTerm.A,
    periods: [
      {
        type,
        instructors,
        building: '',
        room: '',
        location: '',
      } as Section['periods'][number],
    ],
  };
}

const labs = [
  section(11, 'AX01', PeriodType.LAB, []),
  section(12, 'AX02', PeriodType.LAB, ['Pat Teaching-Assistant'], 0),
];
const discussion = section(21, 'AD01', PeriodType.DISCUSSION, []);

const calculus: Course = {
  id: 'MA-1021-2026',
  number: '1021',
  name: 'Calculus I',
  description: '',
  departmentAbbr: 'MA',
  departmentName: 'Mathematical Sciences',
  crossListedWith: [],
  degreeAttributes: [],
  courseTypes: [],
  minCredits: 3,
  maxCredits: 3,
  lectures: [
    {
      section: section(1, 'AL04', PeriodType.LECTURE, ['Keenan Kidwell']),
      compatibleDiscussions: [discussion],
      compatibleLabs: labs,
    },
    {
      section: section(2, 'AL01', PeriodType.LECTURE, ['Other Lecturer']),
      compatibleDiscussions: [discussion],
      compatibleLabs: labs,
    },
  ],
};

const RATINGS: Record<string, number> = {
  'Keenan Kidwell': 4.8,
  'Other Lecturer': 2.1,
  'Pat Teaching-Assistant': 5,
};

const rmp = {
  getRatings: (name: string) =>
    name in RATINGS
      ? {
          rating: RATINGS[name],
          difficulty: 3,
          numRatings: 10,
          wouldTakeAgain: 90,
        }
      : null,
} as unknown as RateMyProfessorService;

const pipeline = new SectionFilterPipeline();
pipeline.registerFilter(new SearchTextFilter());
pipeline.registerFilter(new RMPRatingFilter(rmp));
pipeline.registerFilter(new AvailabilityFilter());

function run(filters: Record<string, unknown>): Course[] {
  const sections = pipeline.flattenCoursesToSections([calculus]);
  return pipeline.reconstructCourses(
    pipeline.applyFilters(sections, new Map(Object.entries(filters))),
  );
}

const groupsOf = (courses: Course[]) =>
  (courses[0]?.lectures ?? []).map(g => ({
    lecture: g.section.number,
    labs: g.compatibleLabs.map(l => l.number),
    discussions: g.compatibleDiscussions.map(d => d.number),
  }));

describe('professor search', () => {
  it("keeps a matching lecture with all of its group's labs", () => {
    const result = run({
      searchText: { query: 'kidwell', professorOnly: true },
    });
    expect(groupsOf(result)).toEqual([
      { lecture: 'AL04', labs: ['AX01', 'AX02'], discussions: ['AD01'] },
    ]);
  });

  it('keeps the groups a matching lab belongs to', () => {
    const result = run({
      searchText: { query: 'teaching-assistant', professorOnly: true },
    });
    expect(groupsOf(result).map(g => g.lecture)).toEqual(['AL04', 'AL01']);
  });

  it('drops the course when nothing in it matches', () => {
    expect(
      run({ searchText: { query: 'nobody', professorOnly: true } }),
    ).toEqual([]);
  });

  it('does the same for a professor named in a plain search', () => {
    const result = run({ searchText: { query: 'kidwell' } });
    expect(groupsOf(result).map(g => g.lecture)).toEqual(['AL04']);
  });

  it('leaves per-section filters to narrow the labs', () => {
    const result = run({
      searchText: { query: 'kidwell', professorOnly: true },
      availability: { availableOnly: true },
    });
    expect(groupsOf(result)).toEqual([
      { lecture: 'AL04', labs: ['AX01'], discussions: ['AD01'] },
    ]);
  });
});

describe('RMP rating', () => {
  it("judges a group by its lecture's instructor", () => {
    const result = run({
      rmpRating: { minRating: 4.5, includeWithoutData: false },
    });
    expect(groupsOf(result)).toEqual([
      { lecture: 'AL04', labs: ['AX01', 'AX02'], discussions: ['AD01'] },
    ]);
  });
});
