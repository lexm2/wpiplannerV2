/**
 * SmartScheduler.findSchedules: term grouping and conflict checks across
 * semester (F/S) and quarter (A-D) sections.
 */
import { describe, it, expect } from 'vitest';
import { SmartScheduler } from '../../src/services/scheduling/SmartScheduler';
import type { MaskedCandidate } from '../../src/services/scheduling/AutoScheduler';
import { sectionToMask } from '../../src/core/scheduling/BitMaskEngine';
import {
  DayOfWeek,
  PeriodType,
  type Course,
  type Period,
  type Section,
} from '../../src/types/types';
import { AcademicTerm, type SelectedCourse } from '../../src/types/schedule';
import type { ConflictCriteria } from '../../src/types/filters';
import { FilterService } from '../../src/services/filtering/FilterService';
import { sectionsOf } from '../../src/utils/courseUtils';
import { getDisplayTerms } from '../../src/utils/typeGuards';
import { AcademicYearFilter } from '../../src/core/filtering/filters/AcademicYearFilter';
import { AvailabilityFilter } from '../../src/core/filtering/filters/AvailabilityFilter';
import { SearchTextFilter } from '../../src/core/filtering/filters/SearchTextFilter';

const { MONDAY: M, TUESDAY: T, WEDNESDAY: W } = DayOfWeek;

function period(days: DayOfWeek[], start: string, end: string): Period {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return {
    type: PeriodType.LECTURE,
    professor: 'Prof X',
    startTime: { hours: sh, minutes: sm },
    endTime: { hours: eh, minutes: em },
    location: 'SH',
    building: 'SH',
    room: '101',
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 0,
    days: new Set(days),
  } as Period;
}

let nextCrn = 1000;
function section(
  term: AcademicTerm,
  days: DayOfWeek[],
  start: string,
  end: string,
  number = `${term}01`,
): Section {
  return {
    crn: nextCrn++,
    number,
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 0,
    deliveryMode: 'In-Person',
    status: 'Open',
    startDate: '',
    endDate: '',
    computedTerm: term,
    periods: [period(days, start, end)],
  };
}

function course(code: string, lectures: Section[]): Course {
  return {
    id: code,
    number: code.replace(/^\D+/, ''),
    name: code,
    description: '',
    departmentAbbr: code.replace(/\d+$/, ''),
    departmentName: '',
    minCredits: 3,
    maxCredits: 3,
    lectures: lectures.map(s => ({
      section: s,
      compatibleDiscussions: [],
      compatibleLabs: [],
    })),
  };
}

function candidates(c: Course): MaskedCandidate[] {
  return (c.lectures ?? []).map(lg => ({
    combination: { lecture: lg.section },
    mask: sectionToMask(lg.section),
    term: lg.section.computedTerm,
  }));
}

function schedulesFor(courses: Course[], maxResults = 50) {
  return SmartScheduler.findSchedules(
    { candidatesPerCourse: courses.map(candidates), courses },
    maxResults,
  );
}

/** True when two sections of a schedule meet in a shared quarter at once. */
function hasOverlap(
  schedule: ReturnType<typeof schedulesFor>[number],
): boolean {
  const sections = schedule.flatMap(r => sectionsOf(r.combination));
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = sections[i];
      const b = sections[j];
      const qa = getDisplayTerms(a.computedTerm);
      const shared = getDisplayTerms(b.computedTerm).some(q => qa.includes(q));
      if (shared && (sectionToMask(a) & sectionToMask(b)) !== 0n) return true;
    }
  }
  return false;
}

describe('SmartScheduler.findSchedules semester/quarter conflicts', () => {
  it('never pairs an F section with an overlapping A section (AE601 F01 + CE575 A01)', () => {
    const ae601 = course('AE601', [
      section(AcademicTerm.F, [W], '15:00', '17:50'),
    ]);
    const ce575 = course('CE575', [
      section(AcademicTerm.A, [T, W], '16:00', '17:50'),
    ]);

    const schedules = schedulesFor([ae601, ce575]);
    expect(schedules.filter(hasOverlap)).toEqual([]);
    expect(schedules).toEqual([]);
  });

  it('never pairs an S section with an overlapping D section', () => {
    const grad = course('ME501', [
      section(AcademicTerm.S, [M], '10:00', '11:50'),
    ]);
    const quarter = course('MA2051', [
      section(AcademicTerm.D, [M], '11:00', '11:50'),
    ]);

    expect(schedulesFor([grad, quarter])).toEqual([]);
  });

  it('picks the quarter section that clears the semester section', () => {
    const ae601 = course('AE601', [
      section(AcademicTerm.F, [W], '15:00', '17:50'),
    ]);
    const clash = section(AcademicTerm.B, [W], '16:00', '16:50', 'B01');
    const clear = section(AcademicTerm.B, [W], '09:00', '09:50', 'B02');
    const ce575 = course('CE575', [clash, clear]);

    const schedules = schedulesFor([ae601, ce575]);
    expect(schedules.length).toBeGreaterThan(0);
    expect(schedules.filter(hasOverlap)).toEqual([]);
    const picked = schedules[0].find(r => r.course.id === 'CE575');
    expect(picked?.combination.lecture?.number).toBe('B02');
  });

  it('still lets F and C sections share a time slot (different semesters)', () => {
    const ae601 = course('AE601', [
      section(AcademicTerm.F, [W], '15:00', '17:50'),
    ]);
    const other = course('CE575', [
      section(AcademicTerm.C, [W], '15:00', '17:50'),
    ]);

    expect(schedulesFor([ae601, other])).toHaveLength(1);
  });
});

function filterServiceWith(conflict?: ConflictCriteria): FilterService {
  const fs = new FilterService();
  fs.setConflictDetector();
  if (conflict) fs.addFilter('periodConflict', conflict);
  return fs;
}

function picked(
  c: Course,
  lecture: Section | null,
  allowedTerms?: string[],
): SelectedCourse {
  return {
    course: c,
    selected: lecture ? { lecture } : {},
    isRequired: false,
    lockedSections: new Set(),
    ...(allowedTerms && { allowedTerms }),
  };
}

/** Lecture numbers offered per scheduled course, or null if none can be. */
function candidateNumbers(
  fs: FilterService,
  selection: SelectedCourse[],
): string[][] | null {
  const build = new SmartScheduler(fs).buildCandidateData(selection);
  if (!build.ok) return null;
  return build.input.candidatesPerCourse.map(cs =>
    cs.map(c => c.combination.lecture!.number),
  );
}

describe('SmartScheduler.buildCandidateData locked courses', () => {
  it("blocks the locked course's chosen section for the courses being scheduled", () => {
    const cs2102Lec = section(AcademicTerm.A, [M], '10:00', '10:50', 'AL01');
    const cs2102 = course('CS2102', [cs2102Lec]);
    const ma1022 = course('MA1022', [
      section(AcademicTerm.A, [M], '10:00', '10:50', 'AL01'),
      section(AcademicTerm.A, [M], '13:00', '13:50', 'AL02'),
    ]);

    const selection = [picked(cs2102, cs2102Lec, []), picked(ma1022, null)];
    expect(candidateNumbers(filterServiceWith(), selection)).toEqual([
      ['AL02'],
    ]);
  });

  it('blocks both quarters for a locked semester (F) section', () => {
    const ae601Lec = section(AcademicTerm.F, [W], '15:00', '17:50');
    const ae601 = course('AE601', [ae601Lec]);
    const ce575 = course('CE575', [
      section(AcademicTerm.A, [T, W], '16:00', '17:50', 'A01'),
      section(AcademicTerm.B, [W], '16:00', '16:50', 'B01'),
      section(AcademicTerm.C, [W], '16:00', '16:50', 'C01'),
    ]);

    const selection = [picked(ae601, ae601Lec, []), picked(ce575, null)];
    expect(candidateNumbers(filterServiceWith(), selection)).toEqual([['C01']]);
  });

  it('leaves the course unschedulable when every section clashes with a locked one', () => {
    const lockedLec = section(AcademicTerm.A, [M], '10:00', '10:50');
    const selection = [
      picked(course('CS2102', [lockedLec]), lockedLec, []),
      picked(
        course('MA1022', [section(AcademicTerm.A, [M], '10:00', '10:50')]),
        null,
      ),
    ];
    expect(candidateNumbers(filterServiceWith(), selection)).toBeNull();
  });

  it('names every course that has no usable section', () => {
    const lockedLec = section(AcademicTerm.A, [M], '10:00', '10:50');
    const selection = [
      picked(course('CS2102', [lockedLec]), lockedLec, []),
      picked(
        course('MA1022', [section(AcademicTerm.A, [M], '10:00', '10:50')]),
        null,
      ),
      picked(
        course('CH1010', [section(AcademicTerm.A, [T], '10:00', '10:50')]),
        null,
      ),
      picked(
        course('PH1110', [section(AcademicTerm.A, [M], '10:00', '10:50')]),
        null,
      ),
    ];

    const build = new SmartScheduler(filterServiceWith()).buildCandidateData(
      selection,
    );
    expect(build.ok).toBe(false);
    expect(!build.ok && build.unschedulable.map(c => c.id)).toEqual([
      'MA1022',
      'PH1110',
    ]);
  });
});

describe('SmartScheduler.buildCandidateData with "avoid conflicts" on', () => {
  it("never blocks a course with its own current sections from the filter's snapshot", () => {
    // The filter was switched on after a generation, so its snapshot holds
    // MA1022's old AL01; the course was then unlocked to be rescheduled.
    const old = section(AcademicTerm.A, [M], '10:00', '10:50', 'AL01');
    const sameTime = section(AcademicTerm.A, [M], '10:00', '10:50', 'AL02');
    const ma1022 = course('MA1022', [old, sameTime]);
    const fs = filterServiceWith({
      avoidConflicts: true,
      blockedSlots: [],
      selectedCourses: [picked(ma1022, old)],
    });

    expect(candidateNumbers(fs, [picked(ma1022, old)])).toEqual([
      ['AL01', 'AL02'],
    ]);
  });

  it("doesn't block with the old sections of another course being rescheduled", () => {
    const csOld = section(AcademicTerm.A, [M], '10:00', '10:50', 'AL01');
    const cs2102 = course('CS2102', [
      csOld,
      section(AcademicTerm.A, [T], '10:00', '10:50', 'AL02'),
    ]);
    const ma1022 = course('MA1022', [
      section(AcademicTerm.A, [M], '10:00', '10:50', 'AL01'),
    ]);
    const fs = filterServiceWith({
      avoidConflicts: true,
      blockedSlots: [],
      selectedCourses: [picked(cs2102, csOld)],
    });

    expect(
      candidateNumbers(fs, [picked(cs2102, csOld), picked(ma1022, null)]),
    ).toEqual([['AL01', 'AL02'], ['AL01']]);
  });

  it('blocks with the current selection, not the one when the filter was enabled', () => {
    // Enabled before anything was picked: the snapshot is empty.
    const fs = filterServiceWith({
      avoidConflicts: true,
      blockedSlots: [],
      selectedCourses: [],
    });
    const lockedLec = section(AcademicTerm.A, [M], '10:00', '10:50');
    const ma1022 = course('MA1022', [
      section(AcademicTerm.A, [M], '10:00', '10:50', 'AL01'),
      section(AcademicTerm.A, [M], '12:00', '12:50', 'AL02'),
    ]);

    expect(
      candidateNumbers(fs, [
        picked(course('CS2102', [lockedLec]), lockedLec, []),
        picked(ma1022, null),
      ]),
    ).toEqual([['AL02']]);
  });

  it('still honours blocked calendar slots', () => {
    const fs = filterServiceWith({
      avoidConflicts: false,
      blockedSlots: [
        {
          id: 'local-1-abc-A-M',
          day: M,
          startTime: { hours: 10, minutes: 0 },
          endTime: { hours: 11, minutes: 0 },
          term: AcademicTerm.A,
        },
      ],
    });
    const ma1022 = course('MA1022', [
      section(AcademicTerm.A, [M], '10:00', '10:50', 'AL01'),
      section(AcademicTerm.A, [M], '12:00', '12:50', 'AL02'),
    ]);

    expect(candidateNumbers(fs, [picked(ma1022, null)])).toEqual([['AL02']]);
  });
});

/** Deterministic PRNG (mulberry32) so a failing case can be replayed. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random candidates on a coarse grid of times, so clashes are common. */
function randomGroup(seed: number): MaskedCandidate[][] {
  const rand = rng(seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const terms = [AcademicTerm.A, AcademicTerm.B, AcademicTerm.F];
  const days = [M, T, W];
  const n = 1 + Math.floor(rand() * 5);
  return Array.from({ length: n }, () =>
    Array.from({ length: 1 + Math.floor(rand() * 5) }, () => {
      const start = 8 + Math.floor(rand() * 6);
      const s = section(
        pick(terms),
        [pick(days)],
        `${start}:00`,
        `${start}:50`,
      );
      return {
        combination: { lecture: s },
        mask: sectionToMask(s),
        term: s.computedTerm,
      };
    }),
  );
}

const internals = SmartScheduler as unknown as {
  bestForTermGroup(c: MaskedCandidate[][]): object[] | null;
  gapForSelections(s: MaskedCandidate[]): number;
};

/** Every combination in order, keeping the first with the smallest gap. */
function bruteForce(group: MaskedCandidate[][]): object[] | null {
  let best: MaskedCandidate[] | null = null;
  let bestGap = Infinity;
  const visit = (i: number, chosen: MaskedCandidate[]): void => {
    if (i === group.length) {
      const clash = chosen.some((a, x) =>
        chosen.slice(x + 1).some(b => {
          const qa = getDisplayTerms(a.term);
          const shared = getDisplayTerms(b.term).some(q => qa.includes(q));
          return shared && (a.mask & b.mask) !== 0n;
        }),
      );
      if (clash) return;
      const gap = internals.gapForSelections(chosen);
      if (gap < bestGap) {
        bestGap = gap;
        best = [...chosen];
      }
      return;
    }
    for (const c of group[i]) visit(i + 1, [...chosen, c]);
  };
  visit(0, []);
  return best && (best as MaskedCandidate[]).map(c => c.combination);
}

describe('SmartScheduler group search', () => {
  it('picks the same combination as an exhaustive search', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const group = randomGroup(seed);
      expect(internals.bestForTermGroup(group), `seed ${seed}`).toEqual(
        bruteForce(group),
      );
    }
  });

  it('abandons a branch at its first clash instead of enumerating past it', () => {
    // The first two courses only meet at the same time, so no combination
    // works; an exhaustive walk would still visit all 8^8 of them.
    const clashing = () =>
      Array.from({ length: 8 }, () =>
        section(AcademicTerm.A, [M], '9:00', '9:50'),
      );
    const free = (i: number) =>
      Array.from({ length: 8 }, (_, j) =>
        section(AcademicTerm.A, [T], `${8 + j}:00`, `${8 + j}:50`, `${i}${j}`),
      );
    const group = [clashing(), clashing(), ...[0, 1, 2, 3, 4, 5].map(free)].map(
      sections =>
        sections.map(s => ({
          combination: { lecture: s },
          mask: sectionToMask(s),
          term: s.computedTerm,
        })),
    );

    const started = performance.now();
    expect(internals.bestForTermGroup(group)).toBeNull();
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe('SmartScheduler.buildCandidateData with course-list filters', () => {
  function filterServiceWithListFilters(): FilterService {
    const fs = filterServiceWith();
    fs.registerFilter(new SearchTextFilter());
    fs.registerFilter(new AcademicYearFilter());
    fs.registerFilter(new AvailabilityFilter());
    return fs;
  }

  it('ignores a search and year that exclude the chosen courses', () => {
    // As left behind by the Degree page's "open course".
    const fs = filterServiceWithListFilters();
    fs.addFilter('searchText', { query: 'zzz-no-match' });
    fs.addFilter('academicYear', { year: 2023 });
    const ma1022 = course('MA1022', [
      section(AcademicTerm.A, [M], '10:00', '10:50', 'AL01'),
    ]);

    expect(candidateNumbers(fs, [picked(ma1022, null)])).toEqual([['AL01']]);
  });

  it('still applies section filters such as availability', () => {
    const fs = filterServiceWithListFilters();
    fs.addFilter('availability', { availableOnly: true });
    const full = section(AcademicTerm.A, [M], '10:00', '10:50', 'AL01');
    full.seatsAvailable = 0;
    const open = section(AcademicTerm.A, [M], '13:00', '13:50', 'AL02');
    const ma1022 = course('MA1022', [full, open]);

    expect(candidateNumbers(fs, [picked(ma1022, null)])).toEqual([['AL02']]);
  });
});
