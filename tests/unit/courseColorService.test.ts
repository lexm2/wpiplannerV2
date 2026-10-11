/**
 * CourseColorService: palette colors stay unique while there are enough, and
 * a color only becomes free again once no course - auto, hashed or custom -
 * still uses it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CourseColorService } from '../../src/services/scheduling/CourseColorService';
import type { CourseSelectionService } from '../../src/services/selection/CourseSelectionService';
import { appState } from '../../src/core/state/appState.svelte';
import type { SelectedCourse } from '../../src/types/schedule';

const PALETTE_SIZE = 10;

function sc(id: string, customColor?: string): SelectedCourse {
  return { course: { id }, customColor } as unknown as SelectedCourse;
}

function makeService() {
  const selection = { setCourseColor: vi.fn() };
  const service = new CourseColorService(
    selection as unknown as CourseSelectionService,
  );
  return { service, selection };
}

/** Assigns colors to `ids` and returns them in order. */
function assign(service: CourseColorService, ids: string[]): string[] {
  service.precomputeCourseColors(ids.map(id => sc(id)));
  return ids.map(id => service.getCourseColor(id));
}

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

afterEach(() => {
  appState.selectedCourses = [];
});

describe('CourseColorService assignment', () => {
  it('gives the first N courses distinct palette colors', () => {
    const { service } = makeService();
    const colors = assign(service, ids('c', PALETTE_SIZE));
    expect(new Set(colors).size).toBe(PALETTE_SIZE);
    for (const c of colors) expect(c).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('keeps a course on the color it already has', () => {
    const { service } = makeService();
    const [first] = assign(service, ['a']);
    assign(service, ['b', 'a']);
    expect(service.getCourseColor('a')).toBe(first);
  });

  it('falls back to a palette color once the palette is exhausted', () => {
    const { service } = makeService();
    const palette = assign(service, ids('c', PALETTE_SIZE));
    const [extra] = assign(service, ['overflow']);
    expect(palette).toContain(extra);
  });

  it('returns the neutral gray for an unknown course', () => {
    const { service } = makeService();
    expect(service.getCourseColor('nope')).toBe('#6B7280');
  });
});

describe('CourseColorService release', () => {
  it('frees a released color for the next course', () => {
    const { service } = makeService();
    const [a] = assign(service, ['a', 'b']);
    service.releaseCourseColor('a');
    expect(assign(service, ['c'])).toEqual([a]);
  });

  it('does not free a color a hashed overflow course still uses', () => {
    const { service } = makeService();
    const paletteIds = ids('c', PALETTE_SIZE);
    assign(service, paletteIds);
    const [shared] = assign(service, ['overflow']);

    // Release every palette owner: only the overflow course holds a color.
    for (const id of paletteIds) service.releaseCourseColor(id);
    const next = assign(service, ids('n', PALETTE_SIZE - 1));

    expect(next).not.toContain(shared);
    expect(new Set(next).size).toBe(PALETTE_SIZE - 1);
  });

  it('does not free a color a custom pick still uses', () => {
    const { service } = makeService();
    const [auto] = assign(service, ['a']);
    service.precomputeCourseColors([sc('b', auto)]);

    service.releaseCourseColor('a');
    const [c] = assign(service, ['c']);
    expect(c).not.toBe(auto);
    expect(service.getCourseColor('b')).toBe(auto);
  });

  it('does not hand out a palette color held as a custom pick', () => {
    const { service } = makeService();
    const palette = assign(service, ids('p', PALETTE_SIZE));
    // Learn the palette, then start over with the second color taken.
    const { service: fresh } = makeService();
    fresh.precomputeCourseColors([sc('custom', palette[0])]);
    expect(assign(fresh, ['a'])).toEqual([palette[1]]);
  });

  it('releases colors of courses no longer selected', () => {
    const { service } = makeService();
    const [a, b] = assign(service, ['a', 'b']);
    appState.selectedCourses = [sc('b')];
    service.releaseUnselectedColors();

    expect(service.getCourseColor('a')).toBe('#6B7280');
    expect(service.getCourseColor('b')).toBe(b);
    expect(assign(service, ['c'])).toEqual([a]);
  });
});

describe('CourseColorService recoloring', () => {
  it('releases the old color and persists the new one', () => {
    const { service, selection } = makeService();
    const [old] = assign(service, ['a']);

    service.setCourseColor('a', '#123456');
    expect(service.getCourseColor('a')).toBe('#123456');
    expect(selection.setCourseColor).toHaveBeenCalledWith('a', '#123456');

    expect(assign(service, ['b'])).toEqual([old]);
  });
});
