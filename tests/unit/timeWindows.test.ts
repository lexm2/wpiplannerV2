import { describe, it, expect } from 'vitest';
import { DayOfWeek } from '../../src/types/types';
import type { TimeWindow } from '../../src/types/filters';
import {
  CELL_MINUTES,
  GRID_DAYS,
  GRID_END_MIN,
  GRID_START_MIN,
  ROWS_PER_DAY,
  cellIndex,
  cellsFromWindows,
  describeWindows,
  rowStartMin,
  windowsFromCells,
} from '../../src/utils/timeWindows';

const M = DayOfWeek.MONDAY;
const T = DayOfWeek.TUESDAY;
const R = DayOfWeek.THURSDAY;

/** Cells for one day, from `row` inclusive to `endRow` exclusive. */
function run(dayIndex: number, row: number, endRow: number): number[] {
  const out: number[] = [];
  for (let r = row; r < endRow; r++) out.push(cellIndex(dayIndex, r));
  return out;
}

describe('timeWindows', () => {
  describe('grid constants', () => {
    it('covers 8 AM to 8 PM in 30-minute rows', () => {
      expect(GRID_START_MIN).toBe(8 * 60);
      expect(GRID_END_MIN).toBe(20 * 60);
      expect(CELL_MINUTES).toBe(30);
      expect(ROWS_PER_DAY).toBe(24);
    });

    it('maps row 0 to 8:00 and the last row to 7:30 PM', () => {
      expect(rowStartMin(0)).toBe(480);
      expect(rowStartMin(ROWS_PER_DAY - 1)).toBe(1170);
    });
  });

  describe('windowsFromCells', () => {
    it('returns nothing for an empty selection', () => {
      expect(windowsFromCells(new Set())).toEqual([]);
    });

    it('merges consecutive rows into one band', () => {
      // Tue rows 4-7 => 10:00-12:00
      const cells = new Set(run(1, 4, 8));
      expect(windowsFromCells(cells)).toEqual([
        { day: T, startMin: 600, endMin: 720 },
      ]);
    });

    it('keeps a one-row gap as two bands', () => {
      const cells = new Set([...run(1, 4, 6), ...run(1, 7, 9)]);
      expect(windowsFromCells(cells)).toEqual([
        { day: T, startMin: 600, endMin: 660 },
        { day: T, startMin: 690, endMin: 750 },
      ]);
    });

    it('closes a run that reaches the bottom edge', () => {
      const cells = new Set(run(0, ROWS_PER_DAY - 2, ROWS_PER_DAY));
      expect(windowsFromCells(cells)).toEqual([
        { day: M, startMin: 1140, endMin: GRID_END_MIN },
      ]);
    });

    it('emits one band per day of a rectangle, in weekday order', () => {
      const cells = new Set([
        ...run(2, 4, 6),
        ...run(0, 4, 6),
        ...run(1, 4, 6),
      ]);
      expect(windowsFromCells(cells).map(w => w.day)).toEqual([
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
      expect(cellsFromWindows(windowsFromCells(cells))).toEqual(cells);
    });

    it('ignores days outside the Monday-Friday grid', () => {
      const weekend: TimeWindow[] = [
        { day: DayOfWeek.SATURDAY, startMin: 600, endMin: 720 },
      ];
      expect(cellsFromWindows(weekend).size).toBe(0);
    });

    it('snaps an unaligned window outward and clamps to the grid', () => {
      // 7:45-10:10 => rows 0 (clamped from -1) through 4 exclusive... 10:10
      // ceils into row 5.
      const ragged: TimeWindow[] = [{ day: M, startMin: 465, endMin: 610 }];
      expect(cellsFromWindows(ragged)).toEqual(new Set(run(0, 0, 5)));
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
});
