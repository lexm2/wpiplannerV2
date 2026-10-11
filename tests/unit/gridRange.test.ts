import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GRID_RANGE,
  gridHours,
  gridRangeOf,
  hourLabel,
} from '../../src/utils/gridRange';

const span = (startMin: number, endMin: number) => ({ startMin, endMin });

describe('gridRange', () => {
  it('defaults to 8:00 AM-8:00 PM', () => {
    expect(DEFAULT_GRID_RANGE).toEqual({ startMin: 480, endMin: 1200 });
    expect(gridHours(DEFAULT_GRID_RANGE)).toBe(12);
  });

  it('returns the default for no spans', () => {
    expect(gridRangeOf([])).toEqual(DEFAULT_GRID_RANGE);
  });

  it('keeps the default when every span fits inside it', () => {
    expect(gridRangeOf([span(600, 650), span(1080, 1190)])).toEqual(
      DEFAULT_GRID_RANGE,
    );
  });

  it('is never narrower than the default', () => {
    expect(gridRangeOf([span(720, 780)])).toEqual(DEFAULT_GRID_RANGE);
  });

  it('rounds out to whole hours', () => {
    // 6:30 AM-8:50 PM => 6:00 AM-9:00 PM
    expect(gridRangeOf([span(390, 450), span(1080, 1250)])).toEqual({
      startMin: 360,
      endMin: 1260,
    });
  });

  it('keeps a span that already ends on the hour', () => {
    expect(gridRangeOf([span(360, 420), span(1200, 1260)])).toEqual({
      startMin: 360,
      endMin: 1260,
    });
  });

  it('ignores empty and inverted spans, like the async 12:00-12:00 placeholder', () => {
    expect(gridRangeOf([span(720, 720), span(1300, 60)])).toEqual(
      DEFAULT_GRID_RANGE,
    );
  });

  it('widens a given base rather than the default', () => {
    const base = { startMin: 360, endMin: 1260 };
    expect(gridRangeOf([span(600, 660)], base)).toEqual(base);
    expect(gridRangeOf([span(300, 330)], base)).toEqual({
      startMin: 300,
      endMin: 1260,
    });
  });

  it('labels each hour row from the range start', () => {
    const range = { startMin: 360, endMin: 1260 };
    expect(hourLabel(range, 0)).toBe('6:00 AM');
    expect(hourLabel(range, 6)).toBe('12:00 PM');
    expect(hourLabel(range, gridHours(range) - 1)).toBe('8:00 PM');
  });

  it('stays within one day', () => {
    expect(gridRangeOf([span(-30, 30), span(1400, 1500)])).toEqual({
      startMin: 0,
      endMin: 1440,
    });
  });
});
