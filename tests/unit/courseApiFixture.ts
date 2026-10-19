/**
 * The course API test fixture: a small catalog written to temp dirs, so the
 * refreshed public/ data cannot move results, and helpers that call the
 * HTTP routes and MCP tools over it with "today" pinned. Importing it
 * registers the setup and cleanup hooks.
 */
import { afterAll, beforeAll, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogSource } from '../../src/api/catalog';
import { createApiHandler } from '../../src/api/http';
import { createMcpEndpoint } from '../../src/mcp/server';

export const BASE = '/wpiplannerV2';

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
  extra: Record<string, unknown> = {},
) => ({
  crn,
  number,
  computedTerm,
  seats: 30,
  seatsAvailable,
  deliveryMode: 'In-Person',
  status: 'Open',
  periods,
  ...extra,
});

/** A lecture section, or a whole group with its labs. */
type Lecture =
  ReturnType<typeof section> | { section: unknown; compatibleLabs: unknown[] };

const course = (
  id: string,
  name: string,
  lectures: Lecture[],
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
    lectures: lectures.map(l => ('section' in l ? l : { section: l })),
    ...extra,
  };
};

// MA 543 and DS 502 are one class under two codes, meeting Monday evenings
// all fall, which clashes with PSY 1400 in B term.
const crossListed = section(30, 'F01', 'F', [
  period(['M'], '18:00', '20:50', 'Grace Hopper'),
]);

export function catalogJson(extraName = '') {
  return {
    departments: [
      {
        abbreviation: 'MA',
        name: 'Mathematical Sciences',
        courses: [
          course(
            'MA-1021-2026',
            `Calculus I${extraName}`,
            [
              section(4, 'CL01', 'C', [
                period(['M', 'T', 'R', 'F'], '10:00', '10:50'),
              ]),
              section(
                5,
                'AL01',
                'A',
                [
                  period(
                    ['M', 'T', 'R', 'F'],
                    '13:00',
                    '13:50',
                    'Grace Hopper',
                  ),
                ],
                0,
              ),
              // As WPI lists them: Online, with a waitlist.
              section(9, 'Interest List-C Term', 'C', [], 0, {
                isInterestList: true,
                deliveryMode: 'Online',
                status: 'Waitlist',
              }),
            ],
            { category: 1 },
          ),
          course('MA-1021-2027', 'Calculus I', [
            section(6, 'AL01', 'A', [period(['M'], '09:00', '09:50')]),
          ]),
          course('MA-543-2026', 'Statistical Methods', [crossListed], {
            isGraduate: true,
            crossListedWith: ['DS 502'],
          }),
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
        abbreviation: 'DS',
        name: 'Data Science',
        courses: [
          course('DS-502-2026', 'Statistical Methods', [crossListed], {
            isGraduate: true,
            crossListedWith: ['MA 543'],
          }),
        ],
      },
      {
        abbreviation: 'PH',
        name: 'Physics',
        courses: [
          course(
            'PH-1110-2026',
            'General Physics',
            (() => {
              const any = section(22, 'BX01', 'B', [
                period(['W'], '14:00', '14:50', 'Not Assigned'),
              ]);
              const online = section(
                23,
                'BX02',
                'B',
                [period(['R'], '14:00', '14:50', 'Not Assigned')],
                10,
                { deliveryMode: 'Online' },
              );
              return [
                {
                  section: section(20, 'BL01', 'B', [
                    period(['M', 'T', 'R', 'F'], '09:00', '09:50'),
                  ]),
                  compatibleLabs: [any],
                },
                {
                  section: section(
                    21,
                    'BL02',
                    'B',
                    [
                      period(
                        ['M', 'T', 'R', 'F'],
                        '11:00',
                        '11:50',
                        'Grace Hopper',
                      ),
                    ],
                    10,
                    { deliveryMode: 'Online' },
                  ),
                  compatibleLabs: [any, online],
                },
              ];
            })(),
            { category: 1 },
          ),
        ],
      },
      {
        abbreviation: 'PSY',
        name: 'Psychology',
        courses: [
          course(
            'PSY-1400-2026',
            'Social Psychology',
            [
              section(
                40,
                'B01',
                'B',
                [period(['M'], '18:00', '20:50', 'Grace Hopper')],
                0,
                { actualWaitlist: 5, status: 'Waitlist' },
              ),
            ],
            { category: 2, degreeAttributes: ['Social Sciences'] },
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
              section(
                8,
                'BL01',
                'B',
                [period(['T', 'F'], '13:00', '14:50', 'Grace Hopper')],
                2,
              ),
            ],
            { description: '<p>Hands-on robot design.</p>' },
          ),
        ],
      },
    ],
  };
}

// Quarters: A Jan 1-20, B Feb 1-20, C Mar 1-20, D Apr 1-20 of 2026.
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

/** Before A term starts: nothing has ended. */
export const BEFORE_A = new Date(2025, 11, 15);
/** Between A and B: A has ended. */
export const AFTER_A = new Date(2026, 0, 25);
/** In B term. */
export const IN_B = new Date(2026, 1, 10);

let dir: string;
let dataDir: string;

/** The temp dirs the fixture lives in: DATA_DIR and the public/ fallback. */
export const fixtureDirs = () => ({ dir, dataDir });

export const write = (d: string, file: string, body: unknown) =>
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
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
});

/** The API and MCP endpoint over the fixture, with "today" pinned. */
export function endpoints(today: Date) {
  const source = new CatalogSource({
    dataDir,
    publicDir: dir,
    now: () => today,
  });
  return {
    api: createApiHandler({ basePath: BASE, getCatalog: () => source.get() }),
    mcp: createMcpEndpoint(() => source.get()),
  };
}

export async function callOn(
  api: ReturnType<typeof createApiHandler>,
  path: string,
  body?: unknown,
) {
  const response = await api(
    new Request(`http://localhost${BASE}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  expect(response).not.toBeNull();
  return { status: response!.status, body: await response!.json() };
}

export const call = (path: string, body?: unknown) =>
  callOn(endpoints(BEFORE_A).api, path, body);

export async function rpcOn(
  mcp: ReturnType<typeof createMcpEndpoint>,
  method: string,
  params: unknown,
) {
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

export async function tool(name: string, args: unknown, today = BEFORE_A) {
  const result = await rpcOn(endpoints(today).mcp, 'tools/call', {
    name,
    arguments: args,
  });
  return {
    text: result.content[0].text as string,
    isError: result.isError === true,
    data: result.structuredContent,
  };
}

export const codes = (body: { courses: { id: string }[] }) =>
  body.courses.map(c => c.id);
