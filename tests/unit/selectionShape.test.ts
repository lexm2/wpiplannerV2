/**
 * Guards for the two things the compiler cannot see about the keyed selection
 * shape: that reading a selection goes through `sectionsOf` (canonical kind
 * order) rather than `Object.values` (insertion order), and that the preview
 * overlay replaces `selected` instead of aliasing or mutating it.
 */
import { describe, it, expect } from 'vitest';
import {
  sectionsOf,
  encodeCourseSelection,
  decodeCourseSelection,
} from '../../src/utils/courseUtils';
import {
  applyPreviewOverlay,
  buildHoverCourse,
} from '../../src/svelte/schedule/scheduleGeometry';
import { AcademicTerm } from '../../src/types/schedule';
import type { SelectedCourse } from '../../src/types/schedule';
import type { Course, Section } from '../../src/types/types';

// --- builders ---------------------------------------------------------------

function section(number: string, crn: number): Section {
  return {
    crn,
    number,
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 0,
    computedTerm: AcademicTerm.A,
    periods: [],
  };
}

const LEC = section('AL01', 1001);
const DIS = section('AD01', 1002);
const LAB = section('AX01', 1003);

function course(id: string, opts: { standalone?: boolean } = {}): Course {
  return {
    id,
    number: id.split('-')[1],
    name: id,
    departmentAbbr: id.split('-')[0],
    description: '',
    minCredits: 3,
    maxCredits: 3,
    ...(opts.standalone
      ? { standaloneLabs: [LAB] }
      : {
          lectures: [
            {
              section: LEC,
              compatibleDiscussions: [DIS],
              compatibleLabs: [LAB],
            },
          ],
        }),
  } as unknown as Course;
}

function selectedCourse(
  id: string,
  selected: SelectedCourse['selected'],
): SelectedCourse {
  return {
    course: course(id),
    selected,
    isRequired: false,
    lockedSections: new Set(),
  };
}

// --- sectionsOf -------------------------------------------------------------

describe('sectionsOf', () => {
  it('returns lecture, then discussion, then lab', () => {
    expect(sectionsOf({ lecture: LEC, discussion: DIS, lab: LAB })).toEqual([
      LEC,
      DIS,
      LAB,
    ]);
  });

  it('holds that order even when the map was built lab-first', () => {
    // The auto-scheduler builds { lab } for standalone labs and adds kinds
    // as it finds them, so insertion order is not canonical order. Anything
    // reading position 0 as "the primary component" depends on this.
    const built: SelectedCourse['selected'] = {};
    built.lab = LAB;
    built.discussion = DIS;
    built.lecture = LEC;

    expect(Object.keys(built)).toEqual(['lab', 'discussion', 'lecture']);
    expect(sectionsOf(built)).toEqual([LEC, DIS, LAB]);
    expect(Object.values(built)).not.toEqual(sectionsOf(built));
  });

  it('skips absent kinds and tolerates an explicit undefined', () => {
    expect(sectionsOf({ lecture: LEC })).toEqual([LEC]);
    expect(sectionsOf({})).toEqual([]);
    expect(sectionsOf({ lecture: LEC, lab: undefined })).toEqual([LEC]);
  });
});

// --- export wire format -----------------------------------------------------

describe('export encoding', () => {
  it('emits a fixed positional 4-tuple regardless of key insertion order', () => {
    const built: SelectedCourse['selected'] = {};
    built.lab = LAB;
    built.lecture = LEC;

    expect(encodeCourseSelection(selectedCourse('CH-1010', built))).toEqual([
      'CH-1010',
      '1001',
      null,
      '1003',
    ]);
  });

  it('round-trips through decode, dropping the kinds that were null', () => {
    const c = course('CH-1010');
    const [, lec, dis, lab] = encodeCourseSelection(
      selectedCourse('CH-1010', { lecture: LEC, lab: LAB }),
    );

    const decoded = decodeCourseSelection(lec, dis, lab, c);
    expect(decoded).toEqual({ lecture: LEC, lab: LAB });
    expect('discussion' in decoded).toBe(false);
  });
});

// --- preview overlay --------------------------------------------------------

describe('applyPreviewOverlay', () => {
  const existing = selectedCourse('CH-1010', {
    lecture: LEC,
    discussion: DIS,
    lab: LAB,
  });

  it('does not mutate the input list or its courses', () => {
    const input = [existing];
    const snapshot = { ...existing.selected };

    applyPreviewOverlay(input, existing.course, { lecture: LEC });

    expect(input).toHaveLength(1);
    expect(input[0]).toBe(existing);
    expect(existing.selected).toEqual(snapshot);
  });

  it('replaces the whole map, so kinds the wizard dropped disappear', () => {
    const [out] = applyPreviewOverlay([existing], existing.course, {
      lecture: LEC,
    });

    expect(out.selected).toEqual({ lecture: LEC });
    expect('lab' in out.selected).toBe(false);
  });

  it('appends a preview-only course when it is not selected yet', () => {
    const other = course('MA-1021');
    const out = applyPreviewOverlay([existing], other, { lecture: LEC });

    expect(out).toHaveLength(2);
    expect(out[0]).toBe(existing);
    expect(out[1].course.id).toBe('MA-1021');
    expect(out[1].selected).toEqual({ lecture: LEC });
  });

  it('passes the list straight through with nothing to preview', () => {
    expect(applyPreviewOverlay([existing], null, { lecture: LEC })).toEqual([
      existing,
    ]);
    expect(applyPreviewOverlay([existing], existing.course, null)).toEqual([
      existing,
    ]);
  });
});

describe('buildHoverCourse', () => {
  const existing = selectedCourse('CH-1010', { lecture: LEC, lab: LAB });

  it('carries the base course with only the hovered kind', () => {
    const hovered = buildHoverCourse([existing], existing.course, {
      discussion: DIS,
    });

    expect(hovered?.course.id).toBe('CH-1010');
    expect(hovered?.selected).toEqual({ discussion: DIS });
  });

  it('is null when nothing is hovered', () => {
    expect(buildHoverCourse([existing], existing.course, {})).toBeNull();
    expect(buildHoverCourse([existing], existing.course, null)).toBeNull();
    expect(buildHoverCourse([existing], null, { discussion: DIS })).toBeNull();
  });
});
