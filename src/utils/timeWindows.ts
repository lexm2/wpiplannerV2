import { DayOfWeek, type Period, type Section } from '../types/types';
import type { TimeGridMode, TimeWindow } from '../types/filters';
import { TimeUtils } from './timeUtils';

/**
 * Cell/window math for the Times filter's weekly grid.
 *
 * Two representations, bridged by `windowsFromCells` / `cellsFromWindows`:
 *
 * - **Cells** - a flat `Set<number>` of `dayIndex * ROWS_PER_DAY + row` indices.
 *   Cheap to mutate, so this is what the picker holds while dragging.
 * - **Windows** - merged `{day, startMin, endMin}` bands. This is what the
 *   filter criteria store, because matching is then one comparison per band
 *   instead of decomposing every period into cell indices.
 *
 * `windowsFromCells` is the *only* producer of windows, and it guarantees the
 * canonical form the filter relies on: sorted, non-overlapping, and
 * non-adjacent. That last property is load-bearing - a period spanning two
 * bands that were left unmerged would wrongly fail the containment test.
 */

/**
 * Monday-Friday in grid-column order. Deliberately duplicated from
 * `WEEKDAYS` in `src/svelte/schedule/scheduleGeometry.ts` so this module
 * (used by the filter core and its tests) never imports the UI layer.
 */
export const GRID_DAYS: readonly DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];

/** Grid bounds, shared with the schedule view so the two never drift. */
export const GRID_START_MIN = TimeUtils.START_HOUR * 60; // 8:00 AM
export const GRID_END_MIN = TimeUtils.END_HOUR * 60; // 8:00 PM
export const CELL_MINUTES = 30;
export const ROWS_PER_DAY = (GRID_END_MIN - GRID_START_MIN) / CELL_MINUTES;

export function cellIndex(dayIndex: number, row: number): number {
  return dayIndex * ROWS_PER_DAY + row;
}

export function rowStartMin(row: number): number {
  return GRID_START_MIN + row * CELL_MINUTES;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(value, hi));
}

/**
 * Canonical windows from a painted cell set: one band per run of consecutive
 * rows within a day, ordered by weekday then start time.
 */
export function windowsFromCells(cells: ReadonlySet<number>): TimeWindow[] {
  const windows: TimeWindow[] = [];

  for (let dayIndex = 0; dayIndex < GRID_DAYS.length; dayIndex++) {
    let runStart = -1;
    // One past the last row so a run ending at the bottom edge still closes.
    for (let row = 0; row <= ROWS_PER_DAY; row++) {
      const painted = row < ROWS_PER_DAY && cells.has(cellIndex(dayIndex, row));
      if (painted && runStart === -1) {
        runStart = row;
      } else if (!painted && runStart !== -1) {
        windows.push({
          day: GRID_DAYS[dayIndex],
          startMin: rowStartMin(runStart),
          endMin: rowStartMin(row),
        });
        runStart = -1;
      }
    }
  }

  return windows;
}

/**
 * Cells covered by a set of windows. Defensive about alignment (windows from
 * `windowsFromCells` always land on the lattice, but criteria can arrive from
 * a tutorial snapshot) - floor the start, ceil the end, clamp to the grid.
 */
export function cellsFromWindows(windows: readonly TimeWindow[]): Set<number> {
  const cells = new Set<number>();

  for (const w of windows) {
    const dayIndex = GRID_DAYS.indexOf(w.day);
    if (dayIndex === -1) continue;

    const startRow = clamp(
      Math.floor((w.startMin - GRID_START_MIN) / CELL_MINUTES),
      0,
      ROWS_PER_DAY,
    );
    const endRow = clamp(
      Math.ceil((w.endMin - GRID_START_MIN) / CELL_MINUTES),
      0,
      ROWS_PER_DAY,
    );

    for (let row = startRow; row < endRow; row++) {
      cells.add(cellIndex(dayIndex, row));
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

function periodMinutes(period: Period): {
  startMin: number;
  endMin: number;
} {
  return {
    startMin: period.startTime.hours * 60 + period.startTime.minutes,
    endMin: period.endTime.hours * 60 + period.endTime.minutes,
  };
}

/**
 * Periods that actually occupy a slot on the weekly grid. Async sections, rows
 * with a degenerate time span, and periods with no meeting day all impose no
 * schedule constraint and are invisible to this filter.
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
 * True when the period sits inside the painted region on **every** day it
 * meets. A Mon/Wed 10-11 gap should not surface an MWF 10-11 class: it would
 * collide on the Friday the user never painted.
 *
 * Note that period minutes are never clamped to the grid. A 7:00 AM class is
 * simply not containable in a grid that starts at 8:00, which is the right
 * answer for a gap search - clamping it up to 8:00 would make it falsely match
 * a painted 8:00-9:00 window.
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

/**
 * Human summary of a painted grid, e.g. "Only Tue, Thu 10:00-12:00 PM".
 * Rendered visibly under the grid and read out via aria-live, so it is the
 * summary users actually see - not just the filter chip's display value.
 */
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
 * True when a section has nothing on the weekly grid at all - an explicitly
 * async period, the 12:00-12:00 placeholder the course data uses for
 * asynchronous meetings (caught by the zero-duration test in `timedPeriods`),
 * or no periods whatsoever.
 *
 * This is exactly the set of sections the Times filter refuses to judge, which
 * is why the "include async classes" toggle lives beside it: painting a window
 * narrows the timed sections, and this decides whether the untimed ones ride
 * along.
 */
export function isAsyncSection(section: Section): boolean {
  return timedPeriods(section).length === 0;
}
