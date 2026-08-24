import { describe, it, expect } from 'vitest';
import {
  buildCourseIndex,
  groupCourses,
  matchesQuery,
  nextSort,
  COURSE_SORTS,
  UNPLACED_LABEL,
  type CourseIndexEntry,
} from '../../src/services/degree/courseIndex';
import type {
  DegreeBucket,
  DegreeTile,
} from '../../src/services/degree/degreeBuckets';
import type {
  AppliedCourse,
  RequirementCategory,
} from '../../src/types/degree';

// --- builders ---------------------------------------------------------------

function applied(
  code: string,
  opts: { inProgress?: boolean; transfer?: boolean } = {},
): AppliedCourse {
  const [department, number] = code.split(' ');
  return {
    code,
    department,
    number,
    title: `${code} title`,
    credits: 3,
    grade: opts.inProgress ? null : 'A',
    isTransfer: opts.transfer ?? false,
    isInProgress: opts.inProgress ?? false,
    period: null,
    satisfies: [],
  };
}

function bucket(
  id: string,
  name: string,
  opts: { applied?: AppliedCourse[]; category?: RequirementCategory } = {},
): DegreeBucket {
  return {
    id,
    source: 'import',
    name,
    scope: 'WPI',
    category: opts.category ?? 'major_specific',
    status: 'in_progress',
    creditsRequired: null,
    coursesRemaining: null,
    appliedCourses: opts.applied ?? [],
    departments: null,
  };
}

function tile(
  code: string,
  kind: DegreeTile['kind'],
  opts: { courseId?: string | null; term?: string | null } = {},
): DegreeTile {
  return {
    key: `${kind}:${code}`,
    kind,
    courseId: opts.courseId ?? (kind === 'schedule' ? `${code}-id` : null),
    code,
    title: `${code} title`,
    credits: 3,
    term: opts.term ?? null,
    year: 2026,
  };
}

const find = (entries: CourseIndexEntry[], code: string) =>
  entries.find(e => e.code === code)!;

// --- buildCourseIndex -------------------------------------------------------

describe('buildCourseIndex', () => {
  it('classifies transcript courses by transfer and in-progress flags', () => {
    const buckets = [
      bucket('b1', 'Core', {
        applied: [
          applied('CS 1101'),
          applied('CS 2011', { transfer: true }),
          // in-progress transcript courses arrive as placement tiles, not here
          applied('CS 3013', { inProgress: true }),
        ],
      }),
    ];
    const entries = buildCourseIndex(buckets, new Map(), []);

    expect(find(entries, 'CS 1101').source).toBe('completed');
    expect(find(entries, 'CS 2011').source).toBe('transfer');
    expect(entries.some(e => e.code === 'CS 3013')).toBe(false);
  });

  it('records every bucket a course counts toward, without duplicating it', () => {
    const shared = applied('CS 3013');
    const buckets = [
      bucket('b1', 'Core', { applied: [shared] }),
      bucket('b2', 'Systems', { applied: [shared] }),
    ];
    const entries = buildCourseIndex(buckets, new Map(), []);

    expect(entries).toHaveLength(1);
    expect(find(entries, 'CS 3013').buckets.map(b => b.name)).toEqual([
      'Core',
      'Systems',
    ]);
  });

  it('takes planned and schedule courses from the placements map', () => {
    const buckets = [bucket('b1', 'Core')];
    const placements = new Map<string, DegreeTile[]>([
      ['b1', [tile('CS 2223', 'planned'), tile('CS 4241', 'schedule')]],
    ]);
    const entries = buildCourseIndex(buckets, placements, []);

    expect(find(entries, 'CS 2223').source).toBe('planned');
    expect(find(entries, 'CS 2223').courseId).toBeNull();
    expect(find(entries, 'CS 4241').source).toBe('schedule');
    expect(find(entries, 'CS 4241').courseId).toBe('CS 4241-id');
  });

  it('includes unassigned schedule courses with no bucket', () => {
    const entries = buildCourseIndex([], new Map(), [
      tile('CS 1004', 'schedule'),
    ]);
    expect(find(entries, 'CS 1004').buckets).toEqual([]);
  });

  it('sorts by department then course number, not lexically', () => {
    const buckets = [
      bucket('b1', 'Core', {
        applied: [applied('CS 10101'), applied('CS 2011'), applied('BB 1035')],
      }),
    ];
    expect(buildCourseIndex(buckets, new Map(), []).map(e => e.code)).toEqual([
      'BB 1035',
      'CS 2011',
      'CS 10101',
    ]);
  });
});

// --- grouping ---------------------------------------------------------------

describe('groupCourses', () => {
  const buckets = [
    bucket('total', 'Total Credits', {
      category: 'total_credits',
      applied: [applied('CS 1101')],
    }),
    bucket('core', 'Core', { applied: [applied('CS 1101')] }),
  ];
  const placements = new Map<string, DegreeTile[]>([
    ['core', [tile('CS 4241', 'schedule', { term: '2026 Fall A Term' })]],
  ]);
  const entries = buildCourseIndex(buckets, placements, [
    tile('CS 1004', 'schedule'),
  ]);

  it('groups by source and drops empty sections', () => {
    const groups = groupCourses(entries, 'source', buckets);
    expect(groups.map(g => g.label)).toEqual(['In your schedule', 'Completed']);
    expect(groups[0].entries.map(e => e.code)).toEqual(['CS 1004', 'CS 4241']);
  });

  it('puts degree-wide aggregates after real requirements, unplaced last', () => {
    const groups = groupCourses(entries, 'bucket', buckets);
    expect(groups.map(g => g.label)).toEqual([
      'Core',
      'Total Credits',
      UNPLACED_LABEL,
    ]);
  });

  it('repeats a course under each bucket it counts toward', () => {
    const groups = groupCourses(entries, 'bucket', buckets);
    const inCore = groups.find(g => g.label === 'Core')!;
    const inTotal = groups.find(g => g.label === 'Total Credits')!;
    expect(inCore.entries.some(e => e.code === 'CS 1101')).toBe(true);
    expect(inTotal.entries.some(e => e.code === 'CS 1101')).toBe(true);
  });

  it('groups by term with undated courses last', () => {
    const groups = groupCourses(entries, 'term', buckets);
    expect(groups.map(g => g.label)).toEqual(['2026 Fall A Term', 'No term']);
  });

  it('returns one flat section when sorting by code', () => {
    const groups = groupCourses(entries, 'code', buckets);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(entries.length);
  });

  it('returns nothing rather than an empty section for no courses', () => {
    expect(groupCourses([], 'code', buckets)).toEqual([]);
    expect(groupCourses([], 'source', buckets)).toEqual([]);
  });
});

// --- search + sort cycle ----------------------------------------------------

describe('matchesQuery', () => {
  const entry = buildCourseIndex(
    [bucket('core', 'Core Requirement', { applied: [applied('CS 1101')] })],
    new Map(),
    [],
  )[0];

  it('matches code, title, and bucket name case-insensitively', () => {
    expect(matchesQuery(entry, 'cs 11')).toBe(true);
    expect(matchesQuery(entry, 'TITLE')).toBe(true);
    expect(matchesQuery(entry, 'core req')).toBe(true);
  });

  it('matches everything on an empty or whitespace query', () => {
    expect(matchesQuery(entry, '')).toBe(true);
    expect(matchesQuery(entry, '   ')).toBe(true);
  });

  it('rejects a non-match', () => {
    expect(matchesQuery(entry, 'MA 1021')).toBe(false);
  });
});

describe('nextSort', () => {
  it('cycles through every mode and wraps', () => {
    const seen = [COURSE_SORTS[0].key];
    for (let i = 1; i < COURSE_SORTS.length; i++)
      seen.push(nextSort(seen[i - 1]));
    expect(seen).toEqual(COURSE_SORTS.map(s => s.key));
    expect(nextSort(seen[seen.length - 1])).toBe(COURSE_SORTS[0].key);
  });
});
