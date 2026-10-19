/**
 * ConflictFilter.apply against a straightforward reference: every section is
 * tested slot by slot against every blocked slot not from its own course.
 * Random catalogs cover all terms, both semesterSpansQuarters modes,
 * weekends, odd minutes and user-blocked slots whose ids look like CRNs.
 */
import { describe, it, expect } from 'vitest';
import { ConflictFilter } from '../../src/core/filtering/filters/ConflictFilter';
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
import {
  periodToWeeklySlots,
  sectionToWeeklySlots,
  slotsOverlap,
} from '../../src/utils/timeSlotUtils';
import { getSelectedSections } from '../../src/utils/courseUtils';

const TERMS = Object.values(AcademicTerm);
const DAYS = Object.values(DayOfWeek);
const QUARTERS = ['A', 'B', 'C', 'D'];

function covered(term: string, spans: boolean): string[] {
  if (spans) {
    if (term === 'ALL') return QUARTERS;
    if (term === 'F') return ['A', 'B'];
    if (term === 'S') return ['C', 'D'];
    return [term];
  }
  return term === 'ALL' ? [...QUARTERS, 'F', 'S'] : [term];
}

function referenceApply(
  sections: FilterableSection[],
  criteria: ConflictCriteria,
): FilterableSection[] {
  if (!criteria.avoidConflicts) return sections;
  const blocked: WeeklyTimeSlot[] = [...(criteria.blockedSlots ?? [])];
  for (const sc of criteria.selectedCourses ?? []) {
    for (const s of getSelectedSections(sc)) {
      blocked.push(...sectionToWeeklySlots(s));
    }
  }
  if (blocked.length === 0) return sections;
  const spans = criteria.semesterSpansQuarters ?? true;
  const own = new Map<string, Set<string>>();
  for (const sc of criteria.selectedCourses ?? []) {
    own.set(
      sc.course.id,
      new Set(getSelectedSections(sc).map(s => String(s.crn))),
    );
  }
  const selected = new Set([...own.values()].flatMap(c => [...c]));

  return sections.filter(fs => {
    const crn = String(fs.section.crn);
    if (selected.has(crn)) return true;
    const ownCrns = own.get(fs.course.id);
    const relevant = blocked.filter(slot => {
      const slotCrn = slot.id.split('-')[0];
      return slotCrn !== crn && !ownCrns?.has(slotCrn);
    });
    for (const period of fs.section.periods) {
      const term = fs.section.computedTerm || AcademicTerm.ALL;
      for (const a of periodToWeeklySlots(period, term)) {
        for (const b of relevant) {
          const tb = covered(b.term, spans);
          if (
            covered(a.term, spans).some(t => tb.includes(t)) &&
            slotsOverlap(a, b)
          ) {
            return false;
          }
        }
      }
    }
    return true;
  });
}

// Small deterministic PRNG so failures reproduce.
function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function pick<T>(r: () => number, items: T[]): T {
  return items[Math.floor(r() * items.length)];
}

function time(r: () => number): { hours: number; minutes: number } {
  return { hours: 8 + Math.floor(r() * 4), minutes: Math.floor(r() * 60) };
}

function randomSection(r: () => number, crn: number): Section {
  const periods = Array.from({ length: 1 + Math.floor(r() * 2) }, () => {
    const start = time(r);
    const end = {
      hours: start.hours + Math.floor(r() * 2),
      minutes: Math.floor(r() * 60),
    };
    return {
      type: PeriodType.LECTURE,
      professor: 'P',
      startTime: start,
      endTime: end,
      location: '',
      building: '',
      room: '',
      seats: 1,
      seatsAvailable: 1,
      actualWaitlist: 0,
      maxWaitlist: 0,
      days: new Set([pick(r, DAYS), pick(r, DAYS)]),
    };
  });
  return {
    crn,
    number: `S${crn}`,
    seats: 1,
    seatsAvailable: 1,
    actualWaitlist: 0,
    maxWaitlist: 0,
    computedTerm: pick(r, TERMS),
    periods,
  } as Section;
}

function scenario(seed: number): {
  units: FilterableSection[];
  criteria: ConflictCriteria;
} {
  const r = rng(seed);
  let crn = 100;
  const courses: Course[] = Array.from({ length: 8 }, (_, i) => {
    const lectures = Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({
      section: randomSection(r, crn++),
      compatibleDiscussions: [],
      compatibleLabs: [],
    }));
    return {
      id: `C${i}`,
      number: String(i),
      name: '',
      description: '',
      departmentAbbr: 'C',
      departmentName: '',
      degreeAttributes: [],
      courseTypes: [],
      minCredits: 3,
      maxCredits: 3,
      lectures,
    };
  });
  const units: FilterableSection[] = courses.flatMap(course =>
    course.lectures!.map(lg => ({
      course,
      section: lg.section,
      lectureGroup: lg,
      sectionType: SectionType.LECTURE,
    })),
  );
  const selectedCourses: SelectedCourse[] = courses
    .filter(() => r() < 0.3)
    .map(course => ({
      course,
      selected: { lecture: pick(r, course.lectures!).section },
      isRequired: false,
      lockedSections: new Set(),
    }));
  const blockedSlots: WeeklyTimeSlot[] = Array.from(
    { length: Math.floor(r() * 4) },
    () => ({
      // Sometimes an id whose prefix is a real CRN, to cover the exclusion.
      id: `${r() < 0.5 ? 100 + Math.floor(r() * crn) : 'block'}-x`,
      day: pick(r, DAYS),
      startTime: time(r),
      endTime: { hours: 10 + Math.floor(r() * 3), minutes: 0 },
      term: pick(r, TERMS),
    }),
  );
  const spans = r() < 0.33 ? undefined : r() < 0.5;
  return {
    units,
    criteria: {
      avoidConflicts: true,
      blockedSlots,
      selectedCourses,
      ...(spans === undefined ? {} : { semesterSpansQuarters: spans }),
    },
  };
}

describe('ConflictFilter.apply parity with the reference', () => {
  it('keeps exactly the same sections across random catalogs', () => {
    const filter = new ConflictFilter();
    let hidden = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const { units, criteria } = scenario(seed);
      const expected = referenceApply(units, criteria);
      expect(filter.apply(units, criteria), `seed ${seed}`).toEqual(expected);
      hidden += units.length - expected.length;
    }
    // The scenarios must actually exercise hiding, not just pass through.
    expect(hidden).toBeGreaterThan(100);
  });
});
