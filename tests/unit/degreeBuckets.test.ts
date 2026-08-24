import { describe, it, expect } from 'vitest';
import {
  buildBuckets,
  computePlacements,
  computeUnassigned,
  inferBucketDepartments,
  type DegreeBucket,
} from '../../src/services/degree/degreeBuckets';
import {
  findCatalogCourse,
  candidateCodes,
} from '../../src/services/degree/catalogLookup';
import type {
  AppliedCourse,
  DegreeBucketConfig,
  Requirement,
  RequirementCategory,
  RequirementStatus,
  StudentRecord,
} from '../../src/types/degree';
import { EMPTY_BUCKET_CONFIG } from '../../src/types/degree';
import type { Course, Department } from '../../src/types/types';
import type { SelectedCourse } from '../../src/types/schedule';

// --- builders ---------------------------------------------------------------

function applied(code: string): AppliedCourse {
  const [department, number] = code.split(' ');
  return {
    code,
    department,
    number,
    title: code,
    credits: 3,
    grade: 'A',
    isTransfer: false,
    isInProgress: false,
    period: null,
    satisfies: [],
  };
}

function planned(code: string): AppliedCourse {
  return {
    ...applied(code),
    grade: null,
    isInProgress: true,
    period: { year: 2026, season: 'Fall', term: 'A', raw: '2026 Fall A Term' },
  };
}

function req(
  rawName: string,
  category: RequirementCategory,
  opts: { scope?: string; status?: RequirementStatus; applied?: string[] } = {},
): Requirement {
  return {
    rawName,
    category,
    scope: opts.scope ?? '',
    name: rawName,
    status: opts.status ?? 'not_satisfied',
    creditsRequired: null,
    creditsRemaining: null,
    coursesRemaining: null,
    appliedCourses: (opts.applied ?? []).map(applied),
  };
}

function record(
  reqs: Requirement[],
  courses: AppliedCourse[] = [],
): StudentRecord {
  return {
    schemaVersion: 1,
    major: 'Computer Science',
    degree: 'BS',
    startYear: 2025,
    importedAt: 'x',
    requirements: reqs,
    courses,
    credits: { earned: 0, inProgress: 0, transfer: 0, required: null },
  };
}

function course(dept: string, number: string): Course {
  return {
    id: `${dept}-${number}-2026`,
    number,
    name: `${dept} ${number}`,
    description: '',
    departmentAbbr: dept,
    departmentName: dept,
    lectures: [],
    minCredits: 3,
    maxCredits: 3,
    academicYear: 2026,
  };
}

function selected(...courses: Course[]): SelectedCourse[] {
  return courses.map(c => ({
    course: c,
    selected: {},
    isRequired: true,
    lockedSections: new Set<string>(),
  }));
}

function config(
  overrides: Partial<DegreeBucketConfig> = {},
): DegreeBucketConfig {
  return { ...EMPTY_BUCKET_CONFIG, ...overrides };
}

const departments: Department[] = [
  { abbreviation: 'CS', name: 'Computer Science', courses: [] },
  { abbreviation: 'WPE', name: 'Physical Education', courses: [] },
  { abbreviation: 'HU', name: 'Humanities', courses: [] },
];

const bucketNames = (buckets: DegreeBucket[]) => buckets.map(b => b.name);

// --- buildBuckets -----------------------------------------------------------

describe('buildBuckets', () => {
  const rec = record([
    req('CS Core', 'major_specific'),
    req('Humanities & Arts', 'hua'),
    req('Unused Courses', 'unused'),
  ]);

  it('turns requirements into buckets and drops the synthetic unused one', () => {
    const buckets = buildBuckets(rec, config());
    expect(bucketNames(buckets)).toEqual(['CS Core', 'Humanities & Arts']);
    expect(buckets[0].id).toBe('req:CS Core');
    expect(buckets[0].source).toBe('import');
  });

  it('returns only custom buckets when there is no record', () => {
    const buckets = buildBuckets(
      null,
      config({
        custom: [
          {
            id: 'custom:1',
            name: 'Robotics minor',
            creditsRequired: 9,
            coursesRemaining: null,
            departments: ['RBE'],
          },
        ],
      }),
    );
    expect(bucketNames(buckets)).toEqual(['Robotics minor']);
    expect(buckets[0].source).toBe('custom');
  });

  it('merges custom buckets after the imported ones', () => {
    const buckets = buildBuckets(
      rec,
      config({
        custom: [
          {
            id: 'custom:1',
            name: 'Robotics minor',
            creditsRequired: 9,
            coursesRemaining: null,
            departments: [],
          },
        ],
      }),
    );
    expect(bucketNames(buckets)).toEqual([
      'CS Core',
      'Humanities & Arts',
      'Robotics minor',
    ]);
  });

  it('hides a deleted imported bucket without touching the record', () => {
    const buckets = buildBuckets(rec, config({ hidden: ['req:CS Core'] }));
    expect(bucketNames(buckets)).toEqual(['Humanities & Arts']);
    expect(rec.requirements).toHaveLength(3);
  });

  it('applies name and target overrides', () => {
    const buckets = buildBuckets(
      rec,
      config({
        overrides: {
          'req:CS Core': { name: 'Major core', creditsRequired: 18 },
        },
      }),
    );
    expect(buckets[0].name).toBe('Major core');
    expect(buckets[0].creditsRequired).toBe(18);
  });

  it('respects the configured order', () => {
    const buckets = buildBuckets(
      rec,
      config({ order: ['req:Humanities & Arts', 'req:CS Core'] }),
    );
    expect(bucketNames(buckets)).toEqual(['Humanities & Arts', 'CS Core']);
  });

  it('appends buckets missing from the order rather than dropping them', () => {
    // A re-import that introduced a requirement the saved order predates.
    const buckets = buildBuckets(
      rec,
      config({ order: ['req:Humanities & Arts'] }),
    );
    expect(bucketNames(buckets)).toEqual(['Humanities & Arts', 'CS Core']);
  });
});

// --- computePlacements ------------------------------------------------------

describe('computePlacements', () => {
  it('makes in-progress courses tiles and leaves completed ones out', () => {
    const rec = record([
      req('CS Core', 'major_specific', { applied: ['CS 1101'] }),
    ]);
    rec.requirements[0].appliedCourses.push(planned('CS 3733'));
    const buckets = buildBuckets(rec, config());
    const tiles = computePlacements(buckets, [], {}).get('req:CS Core') ?? [];
    expect(tiles).toHaveLength(1); // only the planned course, not the graded CS 1101
    expect(tiles[0]).toMatchObject({ kind: 'planned', code: 'CS 3733' });
  });

  it('places a schedule course in the bucket it was assigned to', () => {
    const buckets = buildBuckets(
      record([req('CS Core', 'major_specific')]),
      config(),
    );
    const out = computePlacements(buckets, selected(course('CS', '4341')), {
      'CS-4341-2026': 'req:CS Core',
    });
    expect(out.get('req:CS Core')?.[0]).toMatchObject({
      kind: 'schedule',
      code: 'CS 4341',
      courseId: 'CS-4341-2026',
    });
  });

  it('places nothing without an assignment', () => {
    const buckets = buildBuckets(
      record([req('CS Core', 'major_specific')]),
      config(),
    );
    // A CS course and an unsatisfied CS bucket: the shape a heuristic would
    // match. Placement is manual, so nothing lands until the user says so.
    const out = computePlacements(buckets, selected(course('CS', '4341')), {});
    expect(out.size).toBe(0);
  });

  it('skips an assignment pointing at a bucket that no longer exists', () => {
    const buckets = buildBuckets(
      record([req('CS Core', 'major_specific')]),
      config(),
    );
    const out = computePlacements(buckets, selected(course('CS', '4341')), {
      'CS-4341-2026': 'req:Deleted Bucket',
    });
    expect(out.size).toBe(0);
  });

  it('tags planned tiles with their catalog academic year (Spring → previous fall)', () => {
    const rec = record([req('CS Core', 'major_specific')]);
    rec.requirements[0].appliedCourses.push({
      ...planned('CS 3733'),
      period: {
        year: 2027,
        season: 'Spring',
        term: 'C',
        raw: '2027 Spring C Term',
      },
    });
    const buckets = buildBuckets(rec, config());
    expect(
      computePlacements(buckets, [], {}).get('req:CS Core')?.[0].year,
    ).toBe(2026);
  });
});

// --- computeUnassigned ------------------------------------------------------

describe('computeUnassigned', () => {
  const rec = record([req('CS Core', 'major_specific')]);

  it('lists every schedule course when nothing is assigned', () => {
    const out = computeUnassigned(rec, selected(course('CS', '4341')), {});
    expect(out.map(t => t.code)).toEqual(['CS 4341']);
    expect(out[0].courseId).toBe('CS-4341-2026');
  });

  it('drops a course once it is assigned', () => {
    const out = computeUnassigned(rec, selected(course('CS', '4341')), {
      'CS-4341-2026': 'req:CS Core',
    });
    expect(out).toEqual([]);
  });

  it('excludes a course Workday already has on the transcript', () => {
    const withTranscript = record(
      [req('CS Core', 'major_specific')],
      [applied('CS 4341')],
    );
    expect(
      computeUnassigned(withTranscript, selected(course('CS', '4341')), {}),
    ).toEqual([]);
  });

  it('excludes a transcript course listed under a cross-listed code', () => {
    const withTranscript = record(
      [req('CS Core', 'major_specific')],
      [{ ...applied('CS 2022'), code: 'CS 2022/ MA 2201' }],
    );
    const out = computeUnassigned(
      withTranscript,
      selected(course('MA', '2201'), course('CS', '4341')),
      {},
    );
    expect(out.map(t => t.code)).toEqual(['CS 4341']);
  });

  it('still lists schedule courses when nothing has been imported', () => {
    expect(
      computeUnassigned(null, selected(course('CS', '4341')), {}),
    ).toHaveLength(1);
  });
});

// --- inferBucketDepartments -------------------------------------------------

describe('inferBucketDepartments', () => {
  const bucketOf = (r: Requirement) => buildBuckets(record([r]), config())[0];

  it('returns applied departments most-common first', () => {
    const b = bucketOf(
      req('CS Core', 'major_specific', {
        applied: ['CS 1101', 'CS 2102', 'MA 1021'],
      }),
    );
    expect(inferBucketDepartments(b, departments)).toEqual(['CS', 'MA']);
  });

  it('falls back to WPE for physical education when nothing applied', () => {
    expect(
      inferBucketDepartments(
        bucketOf(req('Phys Ed', 'physical_education')),
        departments,
      ),
    ).toEqual(['WPE']);
  });

  it('maps a major_specific scope name to its abbreviation', () => {
    const b = bucketOf(
      req('Core', 'major_specific', { scope: 'Computer Science' }),
    );
    expect(inferBucketDepartments(b, departments)).toEqual(['CS']);
  });

  it('returns [] for broad gen-ed buckets with no applied courses', () => {
    expect(
      inferBucketDepartments(
        bucketOf(req('Humanities & Arts', 'hua')),
        departments,
      ),
    ).toEqual([]);
  });

  it('uses a custom bucket’s own departments verbatim', () => {
    const [b] = buildBuckets(
      null,
      config({
        custom: [
          {
            id: 'custom:1',
            name: 'Robotics minor',
            creditsRequired: 9,
            coursesRemaining: null,
            departments: ['RBE', 'ME'],
          },
        ],
      }),
    );
    expect(inferBucketDepartments(b, departments)).toEqual(['RBE', 'ME']);
  });
});

// --- findCatalogCourse ------------------------------------------------------

describe('candidateCodes', () => {
  it('parses spaced, unspaced, and cross-listed codes', () => {
    expect(candidateCodes('CS 3013')).toEqual([{ dept: 'CS', number: '3013' }]);
    expect(candidateCodes('CS3013')).toEqual([{ dept: 'CS', number: '3013' }]);
    expect(candidateCodes('CS 2022/ MA 2201')).toEqual([
      { dept: 'CS', number: '2022' },
      { dept: 'MA', number: '2201' },
    ]);
  });
});

describe('findCatalogCourse', () => {
  const depts: Department[] = [
    {
      abbreviation: 'CS',
      name: 'Computer Science',
      courses: [
        course('CS', '3013'),
        { ...course('CS', '3013'), id: 'CS-3013-2024', academicYear: 2024 },
      ],
    },
    {
      abbreviation: 'MA',
      name: 'Mathematics',
      courses: [course('MA', '2201')],
    },
  ];

  it('prefers the requested year', () => {
    expect(findCatalogCourse('CS 3013', 2024, depts)?.id).toBe('CS-3013-2024');
  });

  it('falls back to the newest matching year when the requested one is absent', () => {
    expect(findCatalogCourse('CS 3013', 2099, depts)?.id).toBe('CS-3013-2026');
  });

  it('resolves a cross-listed alternate', () => {
    expect(findCatalogCourse('CS 9999/ MA 2201', 2026, depts)?.id).toBe(
      'MA-2201-2026',
    );
  });

  it('returns null when nothing matches', () => {
    expect(findCatalogCourse('XX 1234', 2026, depts)).toBeNull();
  });
});
