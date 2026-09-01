import { describe, it, expect } from 'vitest';
import { TimesFilter } from '../../src/core/filtering/filters/TimesFilter';
import type { TimesFilterCriteria, TimeWindow } from '../../src/types/filters';
import type { FilterableSection } from '../../src/types/filterableUnit';
import {
  DayOfWeek,
  SectionType,
  type Course,
  type Period,
  type Section,
} from '../../src/types/types';

const M = DayOfWeek.MONDAY;
const T = DayOfWeek.TUESDAY;
const W = DayOfWeek.WEDNESDAY;
const R = DayOfWeek.THURSDAY;
const F = DayOfWeek.FRIDAY;

function time(hours: number, minutes = 0) {
  return { hours, minutes, displayTime: '' };
}

/** Only the fields TimesFilter reads are populated. */
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

/** Tue + Thu, 10:00-12:00 - the "gap in my schedule" case. */
const tueThu10to12: TimeWindow[] = [
  { day: T, startMin: 600, endMin: 720 },
  { day: R, startMin: 600, endMin: 720 },
];

const only = (windows: TimeWindow[]): TimesFilterCriteria => ({
  mode: 'only',
  windows,
});
const avoid = (windows: TimeWindow[]): TimesFilterCriteria => ({
  mode: 'avoid',
  windows,
});

const filter = new TimesFilter();
const names = (sections: FilterableSection[]) =>
  sections.map(s => s.course.number);

describe('TimesFilter', () => {
  describe('no-op', () => {
    it('returns the same array when no windows are painted', () => {
      const sample = [fs('A', [period([T], 10, 0, 10, 50)])];
      expect(filter.apply(sample, only([]))).toBe(sample);
      expect(filter.apply(sample, avoid([]))).toBe(sample);
    });
  });

  describe('only (whitelist)', () => {
    it('keeps a period exactly filling the window', () => {
      const sample = [fs('exact', [period([T], 10, 0, 12, 0)])];
      expect(names(filter.apply(sample, only(tueThu10to12)))).toEqual([
        'exact',
      ]);
    });

    it('keeps a period strictly inside the window', () => {
      const sample = [fs('inside', [period([T, R], 10, 0, 10, 50)])];
      expect(names(filter.apply(sample, only(tueThu10to12)))).toEqual([
        'inside',
      ]);
    });

    it('drops a period that starts before the window', () => {
      const sample = [fs('early', [period([T], 9, 50, 10, 50)])];
      expect(filter.apply(sample, only(tueThu10to12))).toEqual([]);
    });

    it('drops a period that ends after the window', () => {
      const sample = [fs('late', [period([R], 11, 30, 12, 20)])];
      expect(filter.apply(sample, only(tueThu10to12))).toEqual([]);
    });

    it('keeps a section when one of its periods fits and another does not', () => {
      // A lab outside the gap does not disqualify a lecture that fits it.
      const sample = [
        fs('mixed', [period([T], 10, 0, 10, 50), period([W], 14, 0, 15, 50)]),
      ];
      expect(names(filter.apply(sample, only(tueThu10to12)))).toEqual([
        'mixed',
      ]);
    });

    it('drops an MWF period when only Wednesday is painted', () => {
      // Containment is required on every day the period meets: an MWF class
      // collides on the unpainted Monday and Friday.
      const sample = [fs('mwf', [period([M, W, F], 10, 0, 10, 50)])];
      const wedOnly: TimeWindow[] = [{ day: W, startMin: 600, endMin: 720 }];
      expect(filter.apply(sample, only(wedOnly))).toEqual([]);
    });

    it('keeps an MWF period when all three days are painted', () => {
      const sample = [fs('mwf', [period([M, W, F], 10, 0, 10, 50)])];
      const mwf: TimeWindow[] = [
        { day: M, startMin: 600, endMin: 660 },
        { day: W, startMin: 600, endMin: 660 },
        { day: F, startMin: 600, endMin: 660 },
      ];
      expect(names(filter.apply(sample, only(mwf)))).toEqual(['mwf']);
    });

    it('drops a 7 AM class, which the 8 AM-8 PM grid cannot express', () => {
      const sample = [fs('early-bird', [period([T], 7, 0, 7, 50)])];
      const allTue: TimeWindow[] = [{ day: T, startMin: 480, endMin: 1200 }];
      expect(filter.apply(sample, only(allTue))).toEqual([]);
    });
  });

  describe('avoid (blacklist)', () => {
    it('drops a section overlapping the window by a minute', () => {
      const sample = [fs('brush', [period([T], 11, 59, 12, 50)])];
      expect(filter.apply(sample, avoid(tueThu10to12))).toEqual([]);
    });

    it('keeps a section that abuts the window exactly', () => {
      // Half-open: a class starting when the window ends does not overlap.
      const sample = [fs('abuts', [period([T], 12, 0, 12, 50)])];
      expect(names(filter.apply(sample, avoid(tueThu10to12)))).toEqual([
        'abuts',
      ]);
    });

    it('drops a section when any one of its periods overlaps', () => {
      const sample = [
        fs('mixed', [period([M], 8, 0, 8, 50), period([R], 10, 30, 11, 20)]),
      ];
      expect(filter.apply(sample, avoid(tueThu10to12))).toEqual([]);
    });

    it('keeps a 7 AM class, which overlaps nothing painted', () => {
      const sample = [fs('early-bird', [period([T], 7, 0, 7, 50)])];
      const allTue: TimeWindow[] = [{ day: T, startMin: 480, endMin: 1200 }];
      expect(names(filter.apply(sample, avoid(allTue)))).toEqual([
        'early-bird',
      ]);
    });
  });

  describe('sections with nothing on the grid', () => {
    const untimed: [string, FilterableSection][] = [
      ['async', fs('async', [period([T], 10, 0, 10, 50, { isAsync: true })])],
      ['no periods', fs('no-periods', [])],
      ['no days', fs('no-days', [period([], 10, 0, 10, 50)])],
      ['zero length', fs('zero-length', [period([T], 10, 0, 10, 0)])],
    ];

    for (const [label, section] of untimed) {
      it(`keeps a ${label} section in both modes`, () => {
        expect(filter.apply([section], only(tueThu10to12))).toHaveLength(1);
        expect(filter.apply([section], avoid(tueThu10to12))).toHaveLength(1);
      });
    }
  });

  describe('isValidCriteria', () => {
    it('accepts an empty window list', () => {
      expect(filter.isValidCriteria({ mode: 'only', windows: [] })).toBe(true);
    });

    it('accepts a well-formed window', () => {
      expect(filter.isValidCriteria(only(tueThu10to12))).toBe(true);
    });

    it('rejects an unknown mode', () => {
      expect(filter.isValidCriteria({ mode: 'maybe', windows: [] })).toBe(
        false,
      );
    });

    it('rejects non-array windows', () => {
      expect(filter.isValidCriteria({ mode: 'only', windows: null })).toBe(
        false,
      );
    });

    it('rejects an inverted window', () => {
      expect(
        filter.isValidCriteria({
          mode: 'only',
          windows: [{ day: T, startMin: 720, endMin: 600 }],
        }),
      ).toBe(false);
    });

    it('rejects an unknown day', () => {
      expect(
        filter.isValidCriteria({
          mode: 'only',
          windows: [{ day: 'X', startMin: 600, endMin: 720 }],
        }),
      ).toBe(false);
    });
  });

  describe('getDisplayValue', () => {
    it('describes an empty selection', () => {
      expect(filter.getDisplayValue(only([]))).toBe('Any time');
    });

    it('groups days sharing one band', () => {
      expect(filter.getDisplayValue(only(tueThu10to12))).toBe(
        'Only Tue, Thu 10:00 AM-12:00 PM',
      );
    });

    it('summarises many bands by count', () => {
      const many: TimeWindow[] = [
        { day: M, startMin: 480, endMin: 510 },
        { day: T, startMin: 540, endMin: 570 },
        { day: W, startMin: 600, endMin: 630 },
        { day: R, startMin: 660, endMin: 690 },
      ];
      expect(filter.getDisplayValue(avoid(many))).toBe('Avoid 4 time blocks');
    });
  });
});
