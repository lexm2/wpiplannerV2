import {
  DayOfWeek,
  type Department,
  type Period,
  type Section,
} from '../types/types';
import type { TimeGridMode, TimeWindow } from '../types/filters';
import { TimeUtils } from './timeUtils';
import { getAllSections } from './courseUtils';
import { gridRangeOf, type GridRange, type MinuteSpan } from './gridRange';

/**
 * Cell/window math for the Times filter's weekly grid.
 *
 * Two representations, bridged by `windowsFromCells` / `cellsFromWindows`:
 *
 * - **Cells** - a flat `Set<number>` of `dayIndex * rowCount(range) + row`
 *   indices, what the picker holds while dragging. They only mean something
 *   against the range they were made for.
 * - **Windows** - merged `{day, startMin, endMin}` bands in absolute minutes,
 *   what the filter criteria store, so they outlive a change of range.
 *
 * `windowsFromCells` guarantees the canonical form the filter relies on:
 * sorted, non-overlapping, and non-adjacent. A period spanning two bands left
 * unmerged would wrongly fail the containment test.
 */

/** Monday-Friday in grid-column order. */
export const GRID_DAYS: readonly DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];

export const CELL_MINUTES = 30;

/** Rows per day column: one per 30 minutes of the range. */
export function rowCount(range: GridRange): number {
  return (range.endMin - range.startMin) / CELL_MINUTES;
}

export function cellIndex(
  dayIndex: number,
  row: number,
  range: GridRange,
): number {
  return dayIndex * rowCount(range) + row;
}

export function rowStartMin(row: number, range: GridRange): number {
  return range.startMin + row * CELL_MINUTES;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(value, hi));
}

/**
 * Canonical windows from a painted cell set: one band per run of consecutive
 * rows within a day, ordered by weekday then start time.
 */
export function windowsFromCells(
  cells: ReadonlySet<number>,
  range: GridRange,
): TimeWindow[] {
  const windows: TimeWindow[] = [];
  const rows = rowCount(range);

  for (let dayIndex = 0; dayIndex < GRID_DAYS.length; dayIndex++) {
    let runStart = -1;
    // One past the last row so a run ending at the bottom edge still closes.
    for (let row = 0; row <= rows; row++) {
      const painted = row < rows && cells.has(cellIndex(dayIndex, row, range));
      if (painted && runStart === -1) {
        runStart = row;
      } else if (!painted && runStart !== -1) {
        windows.push({
          day: GRID_DAYS[dayIndex],
          startMin: rowStartMin(runStart, range),
          endMin: rowStartMin(row, range),
        });
        runStart = -1;
      }
    }
  }

  return windows;
}

/**
 * Cells covered by a set of windows: floor the start, ceil the end, clamp to
 * the grid, so an unaligned window still lands on whole cells.
 */
export function cellsFromWindows(
  windows: readonly TimeWindow[],
  range: GridRange,
): Set<number> {
  const cells = new Set<number>();
  const rows = rowCount(range);

  for (const w of windows) {
    const dayIndex = GRID_DAYS.indexOf(w.day);
    if (dayIndex === -1) continue;

    const startRow = clamp(
      Math.floor((w.startMin - range.startMin) / CELL_MINUTES),
      0,
      rows,
    );
    const endRow = clamp(
      Math.ceil((w.endMin - range.startMin) / CELL_MINUTES),
      0,
      rows,
    );

    for (let row = startRow; row < endRow; row++) {
      cells.add(cellIndex(dayIndex, row, range));
    }
  }

  return cells;
}

export type DayWindows = Map<DayOfWeek, { startMin: number; endMin: number }[]>;

export function windowsByDay(windows: readonly TimeWindow[]): DayWindows {
  const byDay: DayWindows = new Map();
  for (const w of windows) {
    const bands = byDay.get(w.day);
    if (bands) bands.push({ startMin: w.startMin, endMin: w.endMin });
    else byDay.set(w.day, [{ startMin: w.startMin, endMin: w.endMin }]);
  }
  return byDay;
}

function periodMinutes(period: Period): MinuteSpan {
  return {
    startMin: period.startTime.hours * 60 + period.startTime.minutes,
    endMin: period.endTime.hours * 60 + period.endTime.minutes,
  };
}

/**
 * Periods that occupy a slot on the weekly grid. Async periods, degenerate
 * spans and periods with no meeting day impose no schedule constraint.
 */
export function timedPeriods(section: Section): Period[] {
  return (section.periods ?? []).filter(period => {
    if (period.isAsync) return false;
    if (period.days.size === 0) return false;
    const { startMin, endMin } = periodMinutes(period);
    return endMin > startMin;
  });
}

/**
 * The whole-hour range covering every timed period in the catalog (never
 * narrower than 8 AM-8 PM), so the Times picker can express any class's hours.
 */
export function catalogGridRange(
  departments: readonly Department[],
): GridRange {
  const spans: MinuteSpan[] = [];
  for (const dept of departments) {
    for (const course of dept.courses) {
      for (const section of getAllSections(course)) {
        for (const period of timedPeriods(section)) {
          spans.push(periodMinutes(period));
        }
      }
    }
  }
  return gridRangeOf(spans);
}

/**
 * True when the period sits inside the painted region on **every** day it
 * meets: a Mon/Wed 10-11 gap should not surface an MWF 10-11 class, which
 * would collide on the unpainted Friday.
 *
 * Period minutes are never clamped to the grid, so a class outside the
 * picker's range is not containable in it.
 */
export function periodInsideWindows(
  period: Period,
  byDay: DayWindows,
): boolean {
  const { startMin, endMin } = periodMinutes(period);
  for (const day of period.days) {
    const bands = byDay.get(day);
    if (!bands) return false;
    const contained = bands.some(
      b => b.startMin <= startMin && endMin <= b.endMin,
    );
    if (!contained) return false;
  }
  return true;
}

/** True when the period hits the painted region on **any** day it meets. */
export function periodOverlapsWindows(
  period: Period,
  byDay: DayWindows,
): boolean {
  const { startMin, endMin } = periodMinutes(period);
  for (const day of period.days) {
    const bands = byDay.get(day);
    if (!bands) continue;
    // Half-open: a class starting exactly when a window ends does not overlap.
    if (bands.some(b => startMin < b.endMin && b.startMin < endMin))
      return true;
  }
  return false;
}

function asTime(minutes: number): {
  hours: number;
  minutes: number;
  displayTime: string;
} {
  return {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
    displayTime: '',
  };
}

/** Human summary of a painted grid, e.g. "Only Tue, Thu 10:00-12:00 PM". */
export function describeWindows(
  windows: readonly TimeWindow[],
  mode: TimeGridMode,
): string {
  if (windows.length === 0) return 'Any time';

  // Group by identical band so "Tue 10-12" and "Thu 10-12" read as one line.
  const bands = new Map<
    string,
    { startMin: number; endMin: number; days: DayOfWeek[] }
  >();
  for (const w of windows) {
    const key = `${w.startMin}-${w.endMin}`;
    const band = bands.get(key);
    if (band) band.days.push(w.day);
    else
      bands.set(key, { startMin: w.startMin, endMin: w.endMin, days: [w.day] });
  }

  const prefix = mode === 'only' ? 'Only' : 'Avoid';
  if (bands.size > 3) return `${prefix} ${bands.size} time blocks`;

  const parts = [...bands.values()]
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
    .map(band => {
      const days = GRID_DAYS.filter(d => band.days.includes(d))
        .map(d => TimeUtils.getDayAbbr(d))
        .join(', ');
      const range = TimeUtils.formatTimeRange(
        asTime(band.startMin),
        asTime(band.endMin),
      );
      return `${days} ${range}`;
    });

  return `${prefix} ${parts.join(' • ')}`;
}

/**
 * True when a section has nothing on the weekly grid: async periods, the
 * 12:00-12:00 placeholder the course data uses for them, or no periods at all.
 */
export function isAsyncSection(section: Section): boolean {
  return timedPeriods(section).length === 0;
}
