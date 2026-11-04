/**
 * ConflictFilter's semesterSpansQuarters mode: on (the default), a semester
 * section (F/S) conflicts with the quarters it runs through (A/B, C/D); off,
 * terms only conflict when they match exactly.
 */
import { describe, it, expect } from 'vitest';
import { ConflictFilter } from '../../src/core/filtering/filters/ConflictFilter';
import { AutoScheduler } from '../../src/services/scheduling/AutoScheduler';
import type { FilterService } from '../../src/services/filtering/FilterService';
import {
  DayOfWeek,
  PeriodType,
  SectionType,
  type Course,
  type Section,
} from '../../src/types/types';
import {
  AcademicTerm,
  type SelectedCourse,
  type WeeklyTimeSlot,
} from '../../src/types/schedule';
import type { ConflictCriteria } from '../../src/types/filters';
import type { FilterableSection } from '../../src/types/filterableUnit';

let nextCrn = 7000;
function mondayAt10(number: string, term: AcademicTerm): Section {
  return {
    crn: nextCrn++,
    number,
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 0,
    computedTerm: term,
    periods: [
      {
        type: PeriodType.LECTURE,
        instructors: ['Prof X'],
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

function course(id: string, section: Section): Course {
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
    lectures: [{ section, compatibleDiscussions: [], compatibleLabs: [] }],
  };
}

/**
 * The course list with one section selected in `selectedTerm`, and a
 * same-time section of another course in `candidateTerm`. Returns whether
 * the candidate survives the filter.
 */
function candidateShown(
  selectedTerm: AcademicTerm,
  candidateTerm: AcademicTerm,
  semesterSpansQuarters?: boolean,
): boolean {
  const picked = mondayAt10('X01', selectedTerm);
  const candidate = mondayAt10('Y01', candidateTerm);
  const selected: SelectedCourse = {
    course: course('AE601', picked),
    selected: { lecture: picked },
    isRequired: false,
    lockedSections: new Set(),
  };
  const other = course('CE575', candidate);
  const units: FilterableSection[] = [
    { course: other, section: candidate, sectionType: SectionType.LECTURE },
  ];
  const criteria: ConflictCriteria = {
    avoidConflicts: true,
    blockedSlots: [],
    selectedCourses: [selected],
    ...(semesterSpansQuarters === undefined ? {} : { semesterSpansQuarters }),
  };
  return new ConflictFilter().apply(units, criteria).length === 1;
}

describe('ConflictFilter course list, semester sections spanning quarters', () => {
  it('hides an A section that clashes with a selected F section', () => {
    expect(candidateShown(AcademicTerm.F, AcademicTerm.A, true)).toBe(false);
    expect(candidateShown(AcademicTerm.F, AcademicTerm.B, true)).toBe(false);
  });

  it('hides an F section that clashes with a selected A section', () => {
    expect(candidateShown(AcademicTerm.A, AcademicTerm.F, true)).toBe(false);
  });

  it('pairs S with C and D, never with A or B', () => {
    expect(candidateShown(AcademicTerm.S, AcademicTerm.D, true)).toBe(false);
    expect(candidateShown(AcademicTerm.S, AcademicTerm.A, true)).toBe(true);
    expect(candidateShown(AcademicTerm.F, AcademicTerm.C, true)).toBe(true);
  });

  it('is on when the criteria leave it unset', () => {
    expect(candidateShown(AcademicTerm.F, AcademicTerm.A)).toBe(false);
  });

  it('keeps the exact-term behaviour when turned off', () => {
    expect(candidateShown(AcademicTerm.F, AcademicTerm.A, false)).toBe(true);
    expect(candidateShown(AcademicTerm.A, AcademicTerm.F, false)).toBe(true);
    expect(candidateShown(AcademicTerm.F, AcademicTerm.F, false)).toBe(false);
    expect(candidateShown(AcademicTerm.A, AcademicTerm.A, false)).toBe(false);
  });
});

function fSlot(): WeeklyTimeSlot {
  return {
    id: '9999-F-mon',
    day: DayOfWeek.MONDAY,
    startTime: { hours: 9, minutes: 0 },
    endTime: { hours: 10, minutes: 0 },
    term: AcademicTerm.F,
  };
}

describe('ConflictFilter blocked masks, semester sections spanning quarters', () => {
  it('keys an F slot by F alone when turned off', () => {
    const masks = new ConflictFilter().getBlockedMasksByTerm({
      avoidConflicts: true,
      blockedSlots: [fSlot()],
      semesterSpansQuarters: false,
    });
    expect([...masks.keys()]).toEqual(['F']);
  });

  it('the auto-scheduler always spreads F across A and B', () => {
    // Even with the course-list toggle off, the scheduler books per quarter.
    const filterService = {
      getActiveFilters: () => [
        {
          id: 'periodConflict',
          criteria: {
            avoidConflicts: true,
            blockedSlots: [fSlot()],
            semesterSpansQuarters: false,
          },
        },
      ],
    } as unknown as FilterService;
    const masks = new AutoScheduler(filterService).getBlockedMasksByTerm();
    expect([...masks.keys()].sort()).toEqual(['A', 'B']);
  });
});

describe('ConflictFilter course list, sections running part of a term', () => {
  /** Whether a same-time B section dated `candidate` survives one dated `picked`. */
  function datedShown(
    picked: [string, string] | null,
    candidate: [string, string] | null,
  ): boolean {
    const pickedSection = mondayAt10('BX01', AcademicTerm.B);
    const candidateSection = mondayAt10('BX02', AcademicTerm.B);
    if (picked) [pickedSection.startDate, pickedSection.endDate] = picked;
    if (candidate)
      [candidateSection.startDate, candidateSection.endDate] = candidate;
    const criteria: ConflictCriteria = {
      avoidConflicts: true,
      blockedSlots: [],
      selectedCourses: [
        {
          course: course('BB3813', pickedSection),
          selected: { lecture: pickedSection },
          isRequired: false,
          lockedSections: new Set(),
        },
      ],
    };
    const other = course('BB3814', candidateSection);
    const units: FilterableSection[] = [
      {
        course: other,
        section: candidateSection,
        sectionType: SectionType.LECTURE,
      },
    ];
    return new ConflictFilter().apply(units, criteria).length === 1;
  }

  it('keeps a section whose dates never meet the picked one', () => {
    // BB 3813 BX01 runs to Nov 12, BX02 from Nov 16: same times, no clash.
    expect(
      datedShown(['2026-10-19', '2026-11-12'], ['2026-11-16', '2026-12-11']),
    ).toBe(true);
  });

  it('hides one whose dates overlap, or when either has no dates', () => {
    expect(
      datedShown(['2026-10-19', '2026-11-16'], ['2026-11-16', '2026-12-11']),
    ).toBe(false);
    expect(datedShown(null, ['2026-11-16', '2026-12-11'])).toBe(false);
  });
});
