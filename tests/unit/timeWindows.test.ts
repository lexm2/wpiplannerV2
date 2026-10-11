import { describe, it, expect } from 'vitest';
import {
  DayOfWeek,
  type Course,
  type Department,
  type Period,
  type Section,
} from '../../src/types/types';
import type { TimeWindow } from '../../src/types/filters';
import { DEFAULT_GRID_RANGE } from '../../src/utils/gridRange';
import {
  CELL_MINUTES,
  GRID_DAYS,
  catalogGridRange,
  cellIndex,
  cellsFromWindows,
  describeWindows,
  rowCount,
  rowStartMin,
  windowsFromCells,
} from '../../src/utils/timeWindows';

const M = DayOfWeek.MONDAY;
const T = DayOfWeek.TUESDAY;
const R = DayOfWeek.THURSDAY;

const DEFAULT = DEFAULT_GRID_RANGE;
const ROWS = rowCount(DEFAULT);
/** 6:00 AM-9:00 PM, the range the current catalog needs. */
const WIDE = { startMin: 360, endMin: 1260 };

/** Cells for one day, from `row` inclusive to `endRow` exclusive. */
function run(
  dayIndex: number,
  row: number,
  endRow: number,
  range = DEFAULT,
): number[] {
  const out: number[] = [];
  for (let r = row; r < endRow; r++) out.push(cellIndex(dayIndex, r, range));
  return out;
}

describe('timeWindows', () => {
  describe('rows', () => {
    it('splits a range into 30-minute rows', () => {
      expect(CELL_MINUTES).toBe(30);
      expect(rowCount(DEFAULT)).toBe(24);
      expect(rowCount(WIDE)).toBe(30);
    });

    it('maps row 0 to the range start and the last row to 30 minutes before its end', () => {
      expect(rowStartMin(0, DEFAULT)).toBe(480);
      expect(rowStartMin(ROWS - 1, DEFAULT)).toBe(1170);
      expect(rowStartMin(0, WIDE)).toBe(360);
      expect(rowStartMin(rowCount(WIDE) - 1, WIDE)).toBe(1230);
    });
  });

  describe('windowsFromCells', () => {
    it('returns nothing for an empty selection', () => {
      expect(windowsFromCells(new Set(), DEFAULT)).toEqual([]);
    });

    it('merges consecutive rows into one band', () => {
      // Tue rows 4-7 => 10:00-12:00
      const cells = new Set(run(1, 4, 8));
      expect(windowsFromCells(cells, DEFAULT)).toEqual([
        { day: T, startMin: 600, endMin: 720 },
      ]);
    });

    it('keeps a one-row gap as two bands', () => {
      const cells = new Set([...run(1, 4, 6), ...run(1, 7, 9)]);
      expect(windowsFromCells(cells, DEFAULT)).toEqual([
        { day: T, startMin: 600, endMin: 660 },
        { day: T, startMin: 690, endMin: 750 },
      ]);
    });

    it('closes a run that reaches the bottom edge', () => {
      const cells = new Set(run(0, ROWS - 2, ROWS));
      expect(windowsFromCells(cells, DEFAULT)).toEqual([
        { day: M, startMin: 1140, endMin: 1200 },
      ]);
    });

    it('reads rows against the range they were painted in', () => {
      // Rows 0-3 of a 6:00 AM grid are the hours before 8.
      const cells = new Set([...run(0, 0, 4, WIDE), ...run(4, 28, 30, WIDE)]);
      expect(windowsFromCells(cells, WIDE)).toEqual([
        { day: M, startMin: 360, endMin: 480 },
        { day: DayOfWeek.FRIDAY, startMin: 1200, endMin: 1260 },
      ]);
    });

    it('emits one band per day of a rectangle, in weekday order', () => {
      const cells = new Set([
        ...run(2, 4, 6),
        ...run(0, 4, 6),
        ...run(1, 4, 6),
      ]);
      expect(windowsFromCells(cells, DEFAULT).map(w => w.day)).toEqual([
        GRID_DAYS[0],
        GRID_DAYS[1],
        GRID_DAYS[2],
      ]);
    });
  });

  describe('cellsFromWindows', () => {
    it('round-trips a painted selection', () => {
      const cells = new Set([
        ...run(1, 4, 8),
        ...run(3, 0, 2),
        ...run(4, 20, 24),
      ]);
      expect(
        cellsFromWindows(windowsFromCells(cells, DEFAULT), DEFAULT),
      ).toEqual(cells);
    });

    it('keeps absolute times when the range changes', () => {
      // A window stored from the old 8-8 grid lands on the same hours of a
      // wider one, just further down.
      const tue10to12 = windowsFromCells(new Set(run(1, 4, 8)), DEFAULT);
      expect(cellsFromWindows(tue10to12, WIDE)).toEqual(
        new Set(run(1, 8, 12, WIDE)),
      );
      expect(windowsFromCells(cellsFromWindows(tue10to12, WIDE), WIDE)).toEqual(
        tue10to12,
      );
    });

    it('ignores days outside the Monday-Friday grid', () => {
      const weekend: TimeWindow[] = [
        { day: DayOfWeek.SATURDAY, startMin: 600, endMin: 720 },
      ];
      expect(cellsFromWindows(weekend, DEFAULT).size).toBe(0);
    });

    it('snaps an unaligned window outward and clamps to the grid', () => {
      // 7:45-10:10 => rows 0 (clamped from -1) through 4 exclusive... 10:10
      // ceils into row 5.
      const ragged: TimeWindow[] = [{ day: M, startMin: 465, endMin: 610 }];
      expect(cellsFromWindows(ragged, DEFAULT)).toEqual(new Set(run(0, 0, 5)));
      // The same window fits whole in a grid that starts at 6:00.
      expect(cellsFromWindows(ragged, WIDE)).toEqual(
        new Set(run(0, 3, 9, WIDE)),
      );
    });
  });

  describe('describeWindows', () => {
    it('describes an empty selection', () => {
      expect(describeWindows([], 'only')).toBe('Any time');
    });

    it('groups days that share a band', () => {
      const windows: TimeWindow[] = [
        { day: T, startMin: 600, endMin: 720 },
        { day: R, startMin: 600, endMin: 720 },
      ];
      expect(describeWindows(windows, 'only')).toBe(
        'Only Tue, Thu 10:00 AM-12:00 PM',
      );
    });

    it('joins separate bands', () => {
      const windows: TimeWindow[] = [
        { day: M, startMin: 480, endMin: 540 },
        { day: T, startMin: 600, endMin: 660 },
      ];
      expect(describeWindows(windows, 'avoid')).toBe(
        'Avoid Mon 8:00-9:00 AM • Tue 10:00-11:00 AM',
      );
    });

    it('falls back to a count past three bands', () => {
      const windows: TimeWindow[] = [
        { day: M, startMin: 480, endMin: 510 },
        { day: T, startMin: 540, endMin: 570 },
        { day: R, startMin: 600, endMin: 630 },
        { day: M, startMin: 660, endMin: 690 },
      ];
      expect(describeWindows(windows, 'only')).toBe('Only 4 time blocks');
    });
  });

  describe('catalogGridRange', () => {
    const at = (
      startMin: number,
      endMin: number,
      days = [M],
      isAsync = false,
    ): Period =>
      ({
        startTime: { hours: Math.floor(startMin / 60), minutes: startMin % 60 },
        endTime: { hours: Math.floor(endMin / 60), minutes: endMin % 60 },
        days: new Set(days),
        isAsync,
      }) as Period;
    const sec = (...periods: Period[]) => ({ periods }) as Section;
    const dept = (
      lectures: Course['lectures'],
      standaloneLabs: Section[] = [],
    ): Department => ({
      abbreviation: 'X',
      name: 'X',
      courses: [{ lectures, standaloneLabs } as Course],
    });

    it('is the default before the catalog loads', () => {
      expect(catalogGridRange([])).toEqual(DEFAULT);
    });

    it('covers every lecture, discussion and lab, rounded out to the hour', () => {
      const departments = [
        dept([
          {
            section: sec(at(600, 650)),
            compatibleDiscussions: [sec(at(360, 450, [T]))],
            compatibleLabs: [],
          },
        ]),
        dept([], [sec(at(1080, 1250, [R]))]),
      ];
      expect(catalogGridRange(departments)).toEqual(WIDE);
    });

    it('ignores async periods and the 12:00-12:00 placeholder', () => {
      const departments = [
        dept([
          {
            section: sec(at(300, 330, [M], true), at(720, 720)),
            compatibleDiscussions: [sec(at(300, 330, []))],
            compatibleLabs: [],
          },
        ]),
      ];
      expect(catalogGridRange(departments)).toEqual(DEFAULT);
    });
  });
});
