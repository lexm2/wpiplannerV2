import { describe, it, expect } from 'vitest';
import { AsyncFilter } from '../../src/core/filtering/filters/AsyncFilter';
import type { AsyncFilterCriteria } from '../../src/types/filters';
import type { FilterableSection } from '../../src/types/filterableUnit';
import {
  DayOfWeek,
  SectionType,
  type Course,
  type Period,
  type Section,
} from '../../src/types/types';

const T = DayOfWeek.TUESDAY;

function time(hours: number, minutes = 0) {
  return { hours, minutes, displayTime: '' };
}

function period(
  days: DayOfWeek[],
  startH: number,
  startM: number,
  endH: number,
  endM: number,
  extra: Partial<Period> = {},
): Period {
  return {
    startTime: time(startH, startM),
    endTime: time(endH, endM),
    days: new Set(days),
    ...extra,
  } as unknown as Period;
}

function course(name: string): Course {
  return {
    id: `${name}-2026`,
    number: name,
    name,
    description: '',
    departmentAbbr: 'HUA',
    departmentName: 'Humanities',
    lectures: [],
    minCredits: 3,
    maxCredits: 3,
    academicYear: 2026,
  };
}

function fs(name: string, periods: Period[]): FilterableSection {
  return {
    course: course(name),
    section: { number: 'A01', periods } as unknown as Section,
    sectionType: SectionType.LECTURE,
  };
}

const filter = new AsyncFilter();
const names = (sections: FilterableSection[]) =>
  sections.map(s => s.course.number);

const timed = fs('timed', [period([T], 10, 0, 10, 50)]);
const flagged = fs('flagged', [period([T], 10, 0, 10, 50, { isAsync: true })]);
// The course data uses a 12:00-12:00 placeholder for asynchronous meetings.
const placeholder = fs('placeholder', [period([T], 12, 0, 12, 0)]);
const noPeriods = fs('no-periods', []);
const noDays = fs('no-days', [period([], 10, 0, 10, 50)]);

const exclude: AsyncFilterCriteria = { include: false };

describe('AsyncFilter', () => {
  describe('include (default)', () => {
    it('returns the same array untouched', () => {
      const sample = [timed, flagged, noPeriods];
      expect(filter.apply(sample, { include: true })).toBe(sample);
    });

    it('treats missing criteria as include', () => {
      const sample = [timed, flagged];
      expect(
        filter.apply(sample, undefined as unknown as AsyncFilterCriteria),
      ).toBe(sample);
    });
  });

  describe('exclude', () => {
    it('keeps a section that meets on the grid', () => {
      expect(names(filter.apply([timed], exclude))).toEqual(['timed']);
    });

    it('drops every shape of section with no meeting time', () => {
      const sample = [flagged, placeholder, noPeriods, noDays];
      expect(filter.apply(sample, exclude)).toEqual([]);
    });

    it('keeps a section whose async period sits beside a timed one', () => {
      // A lecture that meets Tuesday plus an async component is still a class
      // with a meeting time.
      const mixed = fs('mixed', [
        period([T], 10, 0, 10, 50, { isAsync: true }),
        period([T], 14, 0, 14, 50),
      ]);
      expect(names(filter.apply([mixed], exclude))).toEqual(['mixed']);
    });

    it('leaves timed sections in place while dropping async ones', () => {
      expect(names(filter.apply([timed, flagged, noPeriods], exclude))).toEqual(
        ['timed'],
      );
    });
  });

  describe('isValidCriteria', () => {
    it('accepts either boolean', () => {
      expect(filter.isValidCriteria({ include: true })).toBe(true);
      expect(filter.isValidCriteria({ include: false })).toBe(true);
    });

    it('rejects a missing or non-boolean flag', () => {
      expect(filter.isValidCriteria({})).toBe(false);
      expect(filter.isValidCriteria({ include: 'yes' })).toBe(false);
      expect(filter.isValidCriteria(null)).toBe(false);
    });
  });

  describe('getDisplayValue', () => {
    it('names both states', () => {
      expect(filter.getDisplayValue(exclude)).toBe('Hide async classes');
      expect(filter.getDisplayValue({ include: true })).toBe(
        'Include async classes',
      );
    });
  });
});
