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
import { AcademicTerm } from '../../src/types/schedule';
import { sectionsOf } from '../../src/utils/courseUtils';
import { getDisplayTerms } from '../../src/utils/typeGuards';

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
