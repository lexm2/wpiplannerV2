/**
 * The course API: catalog loading from disk, query-param mapping onto the
 * filter criteria, filtering/sort/paging through FilterService,
 * serialization, and conflict detection. Runs on a small fixture catalog
 * written to a temp dir, so the refreshed public/ data cannot move results.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogSource } from '../../src/api/catalog';
import { createApiHandler } from '../../src/api/http';
import { createMcpEndpoint } from '../../src/mcp/server';
import { canonicalWindows } from '../../src/utils/timeWindows';
import { DayOfWeek } from '../../src/types/types';

const BASE = '/wpiplannerV2';

const period = (
  days: string[],
  startTime: string,
  endTime: string,
  professor = 'Ada Lovelace',
) => ({ type: 'Lecture', professor, startTime, endTime, days });

const section = (
  crn: number,
  number: string,
  computedTerm: string,
  periods: unknown[],
  seatsAvailable = 10,
) => ({ crn, number, computedTerm, seats: 30, seatsAvailable, periods });

const course = (
  id: string,
  name: string,
  lectures: unknown[],
  extra: Record<string, unknown> = {},
) => {
  const [, number, year] = id.split('-');
  return {
    id,
    number,
    name,
    description: `<p>${name} &amp; more</p>`,
    minCredits: 3,
    maxCredits: 3,
    academicYear: Number(year),
    lectures: lectures.map(s => ({ section: s })),
    ...extra,
  };
};

function catalogJson(extraName = '') {
  return {
    departments: [
      {
        abbreviation: 'MA',
        name: 'Mathematical Sciences',
        courses: [
          course('MA-1021-2026', `Calculus I${extraName}`, [
            section(4, 'CL01', 'C', [
              period(['M', 'T', 'R', 'F'], '10:00', '10:50'),
            ]),
            section(
              5,
              'AL01',
              'A',
              [period(['M', 'T', 'R', 'F'], '13:00', '13:50', 'Grace Hopper')],
              0,
            ),
          ]),
          course('MA-1021-2027', 'Calculus I', [
            section(6, 'AL01', 'A', [period(['M'], '09:00', '09:50')]),
          ]),
        ],
      },
      {
        abbreviation: 'CS',
        name: 'Computer Science',
        courses: [
          course('CS-2102-2026', 'Object-Oriented Design Concepts', [
            section(1, 'AL01', 'A', [
              period(['M', 'T', 'R', 'F'], '10:00', '10:50'),
            ]),
          ]),
          course('CS-1101-2026', 'Introduction to Program Design', [
            section(3, 'F01', 'F', [period(['M', 'R'], '10:00', '11:20')]),
          ]),
          course(
            'CS-500-2026',
            'Graduate Seminar',
            [
              section(7, 'S01', 'S', [
                { ...period([], '', ''), isAsync: true },
              ]),
            ],
            { isGraduate: true },
          ),
        ],
      },
      {
        abbreviation: 'RBE',
        name: 'Robotics Engineering',
        courses: [
          course(
            'RBE-1001-2026',
            'Introduction To Robotics',
            [
              section(8, 'BL01', 'B', [
                period(['T', 'F'], '13:00', '14:50', 'Grace Hopper'),
              ]),
            ],
            { description: '<p>Hands-on robot design.</p>' },
          ),
        ],
      },
    ],
  };
}

const TERM_BOUNDS = {
  generated: '2026-09-01T00:00:00.000Z',
  years: {
    '2026': Object.fromEntries(
      ['A', 'B', 'C', 'D'].map((t, i) => [
        t,
        {
          startDate: `2026-0${i + 1}-01`,
          endDate: `2026-0${i + 1}-20`,
          offeringPeriod: `2026 ${t} Term`,
          sampleSize: 1,
        },
      ]),
    ),
  },
};

const RMP = {
  lastUpdated: '2026-09-01',
  school: { id: 'wpi', name: 'WPI' },
  totalProfessors: 1,
  professors: [
    {
      id: '1',
      legacyId: 1,
      firstName: 'Ada',
      lastName: 'Lovelace',
      department: 'CS',
      avgRating: 4.54,
      avgDifficulty: 2.1,
      numRatings: 12,
      wouldTakeAgainPercent: 91.2,
      profileUrl: 'https://example.test/ada',
    },
  ],
};

let dir: string;
let dataDir: string;
let api: (request: Request) => Promise<Response | null>;
let mcp: ReturnType<typeof createMcpEndpoint>;

const write = (d: string, file: string, body: unknown) =>
  writeFile(join(d, file), JSON.stringify(body));

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'course-api-'));
  dataDir = await mkdtemp(join(tmpdir(), 'course-api-data-'));
  // The catalog and bounds come from DATA_DIR; ratings only exist in public/.
  await write(dataDir, 'course-data-constructed.json', catalogJson());
  await write(dataDir, 'term-bounds.json', TERM_BOUNDS);
  await write(dataDir, 'last-updated.json', {
    timestamp: '2026-09-02T00:00:00Z',
  });
  await write(dir, 'course-data-constructed.json', { departments: [] });
  await write(dir, 'rateMyProfessor.json', RMP);

  const source = new CatalogSource({ dataDir, publicDir: dir });
  api = createApiHandler({ basePath: BASE, getCatalog: () => source.get() });
  mcp = createMcpEndpoint(() => source.get());
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
});

async function call(path: string, body?: unknown) {
  const response = await api(
    new Request(`http://localhost${BASE}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  expect(response).not.toBeNull();
  return { status: response!.status, body: await response!.json() };
}

const codes = (body: { courses: { id: string }[] }) =>
  body.courses.map(c => c.id);

describe('course search', () => {
  it('defaults to the current year, sorted by department then number', async () => {
    const { body } = await call('/courses');
    expect(body.total).toBe(5);
    expect(codes(body)).toEqual([
      'CS-1101-2026',
      'CS-2102-2026',
      'CS-500-2026',
      'MA-1021-2026',
      'RBE-1001-2026',
    ]);
  });

  it('takes year=all and pages with offset and limit', async () => {
    const { body } = await call('/courses?year=all&offset=3&limit=1');
    expect(body).toMatchObject({ total: 6, offset: 3, limit: 1 });
    expect(codes(body)).toEqual(['MA-1021-2026']);
  });

  it('matches terms exactly and keeps only the matching sections', async () => {
    const { body } = await call('/courses?term=a');
    // CS 1101 runs in F, which an A search does not match.
    expect(codes(body)).toEqual(['CS-2102-2026', 'MA-1021-2026']);
    expect(body.courses[1].terms).toEqual(['A']);
  });

  it('keeps relevance order for a text search', async () => {
    const { body } = await call('/courses/search', {
      filters: { searchText: { query: 'design' } },
    });
    // Names before descriptions: RBE 1001 only mentions design in its
    // description, so it comes last, where no sort by code would put it.
    expect(codes(body)).toEqual([
      'CS-1101-2026',
      'CS-2102-2026',
      'RBE-1001-2026',
    ]);
  });

  it('maps flat params onto the same criteria as the POST body', async () => {
    const get = await call(
      '/courses?department=CS,MA&availableOnly=true&level=undergraduate&minRating=4',
    );
    const post = await call('/courses/search', {
      filters: {
        department: { departments: ['CS', 'MA'] },
        availability: { availableOnly: true },
        graduateLevel: { level: 'undergraduate' },
        rmpRating: { minRating: 4 },
      },
    });
    expect(get.body).toEqual(post.body);
    // MA 1021's A section is full and Grace Hopper has no rating, but its C
    // section passes both.
    expect(codes(get.body)).toEqual([
      'CS-1101-2026',
      'CS-2102-2026',
      'MA-1021-2026',
    ]);
    expect(get.body.courses[2].terms).toEqual(['C']);
  });

  it('filters by time windows given as JSON', async () => {
    const times = {
      mode: 'only',
      windows: [
        DayOfWeek.MONDAY,
        DayOfWeek.TUESDAY,
        DayOfWeek.THURSDAY,
        DayOfWeek.FRIDAY,
      ].flatMap(day => [
        // Touching bands, merged before they reach TimesFilter.
        { day, startMin: 600, endMin: 630 },
        { day, startMin: 630, endMin: 660 },
      ]),
    };
    const { body } = await call(
      `/courses?times=${encodeURIComponent(JSON.stringify(times))}`,
    );
    expect(codes(body)).toEqual(['CS-2102-2026', 'MA-1021-2026']);
  });

  it('drops sections that clash with the CRNs the caller has', async () => {
    // CRN 3 is F term, M/R 10:00-11:20: it blocks CS 2102's A section and
    // not MA 1021's C one.
    const { body } = await call('/courses?avoidCrns=3&department=CS,MA');
    expect(codes(body)).toEqual([
      'CS-1101-2026',
      'CS-500-2026',
      'MA-1021-2026',
    ]);
  });

  it('rejects bad input with zod issues', async () => {
    const term = await call('/courses?term=Q');
    expect(term.status).toBe(400);
    expect(term.body.details[0].path).toEqual(['filters', 'term', 'terms', 0]);
    expect((await call('/courses?limit=201')).status).toBe(400);
    expect((await call('/courses?colour=red')).status).toBe(400);
    expect((await call('/courses?avoidCrns=999')).body.details).toEqual({
      unknownCrns: [999],
    });
    expect((await call('/courses/search', { filter: {} })).status).toBe(400);
  });
});

describe('course detail', () => {
  it('finds a course by id or by code', async () => {
    expect((await call('/courses/MA-1021-2027')).body.id).toBe('MA-1021-2027');
    expect((await call('/courses/MA1021')).body.id).toBe('MA-1021-2026');
    expect((await call('/courses/ma-1021?year=2027')).body.id).toBe(
      'MA-1021-2027',
    );
    expect((await call('/courses/XX-1-2026')).status).toBe(404);
    // CS 2102 has no 2027 offering; an explicit year does not fall back.
    expect((await call('/courses/CS2102?year=2027')).status).toBe(404);
  });

  it('serializes days as arrays, times as HH:MM, and ratings inline', async () => {
    const { body } = await call('/courses/CS-2102-2026');
    expect(body.description).toBe('Object-Oriented Design Concepts & more');
    const [p] = body.lectureGroups[0].lecture.periods;
    expect(p).toMatchObject({
      days: ['M', 'T', 'R', 'F'],
      start: '10:00',
      end: '10:50',
      display: 'MTRF 10:00-10:50 AM',
    });
    expect(p.instructors).toEqual([
      {
        name: 'Ada Lovelace',
        rmp: {
          rating: 4.5,
          difficulty: 2.1,
          numRatings: 12,
          wouldTakeAgain: 91,
          url: 'https://example.test/ada',
        },
      },
    ]);
    expect(body).not.toHaveProperty('ratings');
  });

  it('gives an unrated instructor a null rating', async () => {
    const { body } = await call('/courses/MA-1021-2026');
    const al01 = body.lectureGroups.find(
      (g: { lecture: { number: string } }) => g.lecture.number === 'AL01',
    );
    expect(al01.lecture.periods[0].instructors).toEqual([
      { name: 'Grace Hopper', rmp: null },
    ]);
  });

  it('reports an async period with no days or times', async () => {
    const { body } = await call('/courses/CS-500-2026');
    expect(body.lectureGroups[0].lecture.periods[0]).toMatchObject({
      days: [],
      start: null,
      display: 'Async',
    });
  });
});

describe('conflicts', () => {
  it('pairs a semester section with the quarter it overlaps', async () => {
    const { body } = await call('/conflicts', { crns: [3, 1, 4] });
    expect(body.conflicts).toEqual([
      {
        a: { crn: 3, section: 'F01', term: 'F', courses: ['CS 1101'] },
        b: { crn: 1, section: 'AL01', term: 'A', courses: ['CS 2102'] },
        overlaps: [{ days: ['M', 'R'], start: '10:00', end: '10:50' }],
      },
    ]);
  });

  it('dedupes CRNs and takes a single one', async () => {
    const { body } = await call('/conflicts', { crns: [3, 1, 3] });
    expect(body).toMatchObject({ checked: [3, 1], duplicates: [3] });
    const one = await call('/conflicts', { crns: [3] });
    expect(one.body).toEqual({ checked: [3], duplicates: [], conflicts: [] });
  });

  it('rejects unknown CRNs', async () => {
    const { status, body } = await call('/conflicts', { crns: [1, 42] });
    expect(status).toBe(400);
    expect(body.details).toEqual({ unknownCrns: [42] });
  });
});

describe('catalog', () => {
  it('reports meta and departments', async () => {
    const meta = (await call('/meta')).body;
    expect(meta).toMatchObject({
      lastUpdated: '2026-09-02T00:00:00Z',
      currentAcademicYear: 2026,
      availableYears: [2026, 2027],
    });
    expect(meta.termBounds['2026'].A).toEqual({
      start: '2026-01-01',
      end: '2026-01-20',
    });
    expect((await call('/departments?year=2027')).body.departments).toEqual([
      { abbr: 'MA', name: 'Mathematical Sciences', courseCount: 1 },
    ]);
  });

  it('reloads when the catalog file changes, serving the old data meanwhile', async () => {
    const source = new CatalogSource({
      dataDir,
      publicDir: dir,
      checkIntervalMs: 0,
    });
    const first = await source.get();

    const file = join(dataDir, 'course-data-constructed.json');
    await write(dataDir, 'course-data-constructed.json', catalogJson(' (new)'));
    const later = new Date(Date.now() + 60_000);
    await utimes(file, later, later);

    // The check that spots the change still answers with the old catalog.
    expect(await source.get()).toBe(first);
    let second = first;
    for (let i = 0; i < 100 && second === first; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      second = await source.get();
    }
    expect(second).not.toBe(first);
    expect(second.courses.find(c => c.id === 'MA-1021-2026')?.name).toBe(
      'Calculus I (new)',
    );
  });

  it('answers 404 for unknown routes and ignores paths outside the API', async () => {
    expect((await call('/nope')).status).toBe(404);
    expect(
      await api(new Request(`http://localhost${BASE}/index.html`)),
    ).toBeNull();
  });
});

async function rpc(method: string, params: unknown) {
  const response = await mcp.fetch(
    new Request(`http://localhost${BASE}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  );
  const body = await response.text();
  // Answered as one SSE message: "event: message\ndata: {...}".
  const data = body.split('\n').find(line => line.startsWith('data: '));
  return JSON.parse(data ? data.slice(6) : body).result;
}

describe('MCP server', () => {
  it('lists the tools', async () => {
    const { tools } = await rpc('tools/list', {});
    expect(tools.map((t: { name: string }) => t.name)).toEqual([
      'search_courses',
      'get_course',
      'list_departments',
      'get_catalog_info',
      'check_conflicts',
    ]);
  });

  it('searches with the API query schema', async () => {
    const result = await rpc('tools/call', {
      name: 'search_courses',
      arguments: { filters: { term: { terms: ['A'] } } },
    });
    expect(result.structuredContent.total).toBe(2);
    expect(result.content[0].text).toContain('CS 2102');
  });

  it('reports unknown CRNs as a tool error', async () => {
    const result = await rpc('tools/call', {
      name: 'check_conflicts',
      arguments: { crns: [1, 42] },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown CRN: 42');
  });
});

describe('canonicalWindows', () => {
  it('sorts by weekday and merges overlapping or touching bands', () => {
    expect(
      canonicalWindows([
        { day: DayOfWeek.TUESDAY, startMin: 600, endMin: 660 },
        { day: DayOfWeek.MONDAY, startMin: 700, endMin: 760 },
        { day: DayOfWeek.MONDAY, startMin: 600, endMin: 700 },
        { day: DayOfWeek.MONDAY, startMin: 650, endMin: 680 },
      ]),
    ).toEqual([
      { day: DayOfWeek.MONDAY, startMin: 600, endMin: 760 },
      { day: DayOfWeek.TUESDAY, startMin: 600, endMin: 660 },
    ]);
  });
});
