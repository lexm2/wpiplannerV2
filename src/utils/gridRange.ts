import { TimeUtils } from './timeUtils';

/**
 * The time span a weekly grid shows, in minutes after midnight on whole hours.
 *
 * The schedule grid and the Times picker both start from the default and widen
 * it to fit what they show, so an ordinary schedule keeps its 8 AM-8 PM layout
 * while an early discussion or an evening class is never clipped.
 */
export interface GridRange {
  readonly startMin: number;
  readonly endMin: number;
}

/** Any start/end pair in minutes: a period, a block, a painted window. */
export interface MinuteSpan {
  readonly startMin: number;
  readonly endMin: number;
}

export const DEFAULT_GRID_RANGE: GridRange = {
  startMin: 8 * 60,
  endMin: 20 * 60,
};

const DAY_MIN = 24 * 60;

/**
 * The smallest whole-hour range covering `base` and every span. Empty and
 * inverted spans (the async 12:00-12:00 placeholder) take no room.
 */
export function gridRangeOf(
  spans: Iterable<MinuteSpan>,
  base: GridRange = DEFAULT_GRID_RANGE,
): GridRange {
  let startMin = base.startMin;
  let endMin = base.endMin;
  for (const s of spans) {
    if (s.endMin <= s.startMin) continue;
    if (s.startMin < startMin) startMin = s.startMin;
    if (s.endMin > endMin) endMin = s.endMin;
  }
  startMin = Math.max(0, Math.floor(startMin / 60) * 60);
  endMin = Math.min(DAY_MIN, Math.ceil(endMin / 60) * 60);
  return startMin === base.startMin && endMin === base.endMin
    ? base
    : { startMin, endMin };
}

export function gridHours(range: GridRange): number {
  return (range.endMin - range.startMin) / 60;
}

/** Label for the hour row `i` of a range, e.g. "8:00 AM". */
export function hourLabel(range: GridRange, i: number): string {
  return TimeUtils.formatTime({
    hours: range.startMin / 60 + i,
    minutes: 0,
    displayTime: '',
  });
}
