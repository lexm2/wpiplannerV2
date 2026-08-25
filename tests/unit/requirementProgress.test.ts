import { describe, it, expect } from 'vitest';
import { effectiveProgress } from '../../src/services/degree/requirementProgress';
import type {
  AppliedCourse,
  Requirement,
  RequirementCategory,
  RequirementStatus,
} from '../../src/types/degree';

function completed(code: string, credits: number): AppliedCourse {
  const [department, number] = code.split(' ');
  return {
    code,
    department,
    number,
    title: code,
    credits,
    grade: 'A',
    isTransfer: false,
    isInProgress: false,
    period: null,
    satisfies: [],
  };
}

function req(
  opts: Partial<Requirement> & {
    category?: RequirementCategory;
    status?: RequirementStatus;
  } = {},
): Requirement {
  return {
    rawName: 'R',
    category: opts.category ?? 'major_specific',
    scope: '',
    name: 'R',
    status: opts.status ?? 'not_satisfied',
    creditsRequired: opts.creditsRequired ?? null,
    creditsRemaining: opts.creditsRemaining ?? null,
    coursesRemaining: opts.coursesRemaining ?? null,
    appliedCourses: opts.appliedCourses ?? [],
  };
}

const tile = (
  code: string,
  credits: number,
  kind: 'planned' | 'schedule' = 'schedule',
) => ({ code, credits, kind });

describe('effectiveProgress (credit-based)', () => {
  it('counts completed credits as earned and flips not_satisfied -> in_progress', () => {
    const p = effectiveProgress(
      req({ creditsRequired: 9, appliedCourses: [completed('CS 1101', 3)] }),
      [],
    );
    expect(p.status).toBe('in_progress');
    expect(p.fraction).toBeCloseTo(1 / 3);
    expect(p.creditsRemaining).toBe(6);
    expect(p.emptySlots).toBe(2); // ceil(6/3)
  });

  it('marks satisfied once placed tiles cover the requirement', () => {
    const p = effectiveProgress(
      req({ creditsRequired: 6, appliedCourses: [completed('CS 1101', 3)] }),
      [tile('CS 2022', 3)],
    );
    expect(p.status).toBe('satisfied');
    expect(p.fraction).toBe(1);
    expect(p.creditsRemaining).toBe(0);
    expect(p.emptySlots).toBe(0);
  });

  it('dedupes tiles sharing a code (planned + schedule for the same course)', () => {
    const p = effectiveProgress(req({ creditsRequired: 6 }), [
      tile('CS 2022', 3),
      tile('CS 2022', 3),
    ]);
    expect(p.creditsRemaining).toBe(3); // counted once
    expect(p.status).toBe('in_progress');
  });

  it('splits the bar into earned / planned / schedule segments', () => {
    const p = effectiveProgress(
      req({ creditsRequired: 12, appliedCourses: [completed('CS 1101', 3)] }),
      [tile('CS 2022', 3, 'planned'), tile('CS 3013', 3, 'schedule')],
    );
    expect(p.segments.earned).toBeCloseTo(3 / 12);
    expect(p.segments.planned).toBeCloseTo(3 / 12);
    expect(p.segments.schedule).toBeCloseTo(3 / 12);
  });

  it('attributes a course present as both planned and schedule to planned, counted once', () => {
    const p = effectiveProgress(req({ creditsRequired: 12 }), [
      tile('CS 2022', 3, 'schedule'),
      tile('CS 2022', 3, 'planned'),
    ]);
    expect(p.segments.planned).toBeCloseTo(3 / 12);
    expect(p.segments.schedule).toBe(0);
  });

  it('never downgrades below the imported status', () => {
    const p = effectiveProgress(
      req({
        creditsRequired: 9,
        status: 'satisfied',
        appliedCourses: [completed('CS 1101', 3)],
      }),
      [],
    );
    expect(p.status).toBe('satisfied');
    expect(p.fraction).toBe(1);
  });
});

describe('effectiveProgress (course-count)', () => {
  it('counts placed tiles toward the remaining course count', () => {
    const base = req({
      coursesRemaining: 2,
      appliedCourses: [completed('HU 1000', 3)],
    }); // need 3 total
    expect(effectiveProgress(base, [tile('HU 2000', 3)]).coursesRemaining).toBe(
      1,
    );
    const done = effectiveProgress(base, [
      tile('HU 2000', 3),
      tile('HU 2100', 3),
    ]);
    expect(done.coursesRemaining).toBe(0);
    expect(done.status).toBe('satisfied');
  });
});

describe('effectiveProgress (no numeric target)', () => {
  it('flips to in_progress when a tile is placed, else keeps the base status', () => {
    const base = req({ category: 'mqp' });
    expect(effectiveProgress(base, []).status).toBe('not_satisfied');
    expect(effectiveProgress(base, [tile('CS 4000', 3)]).status).toBe(
      'in_progress',
    );
    expect(effectiveProgress(base, []).fraction).toBeNull();
  });
});
