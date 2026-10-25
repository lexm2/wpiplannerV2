/**
 * The course API's routes, as a web-standard (Request) => Response handler.
 * Every route is a read over the public catalog and answers JSON. See
 * docs/api.md for the routes and query parameters.
 */
import * as z from 'zod';
import type { Catalog } from './catalog';
import {
  CourseQuerySchema,
  FallYearSchema,
  RMP_BOUNDS,
  runCourseQuery,
} from './query';
import { ConflictCheckInputSchema, findConflicts } from './conflicts';
import { catalogMeta, listDepartments, lookupCourse } from './lookup';
import { ApiError, echo } from './errors';
import { logger } from '../utils/logger';
import { TERMS } from '../utils/typeGuards';

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
};

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      ...CORS_HEADERS,
      ...headers,
    },
  });
}

/** Refuses any query parameter but `allowed`, as GET /courses does. */
function onlyParams(params: URLSearchParams, allowed: string[]): void {
  const unknown = [...new Set(params.keys())].filter(k => !allowed.includes(k));
  if (unknown.length > 0) {
    throw new ApiError(
      `Unknown parameter: ${unknown.map(echo).join(', ')}${allowed.length ? `. Accepted: ${allowed.join(', ')}` : '; this route takes none'}.`,
    );
  }
}

/** Plain decimal digits: no hex, exponent, sign or blank ("0x7EA", "1e1", ""). */
const INTEGER_RE = /^\d+$/;
const DECIMAL_RE = /^\d+(\.\d+)?$/;

function parseOrThrow<T extends z.ZodType>(
  schema: T,
  input: unknown,
): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError('Invalid request', 400, result.error.issues);
  }
  return result.data;
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new ApiError('Request body must be JSON');
  }
}

const YearParamSchema = z
  .string()
  .regex(/^\d{4}$/, 'year is a four-digit fall year, e.g. 2026')
  .transform(Number)
  .pipe(FallYearSchema);
const YearOrAllParamSchema = z.union([
  z
    .string()
    .regex(/^all$/i)
    .transform(() => 'all' as const),
  YearParamSchema,
]);

const BoolParamSchema = z
  .enum(['true', 'false', '1', '0'])
  .transform(v => v === 'true' || v === '1');

// GET /courses/:id options; unset ones show everything.
const DetailParamsSchema = z
  .object({
    year: YearParamSchema.optional(),
    terms: z
      .string()
      .transform(v =>
        v
          .split(',')
          .map(t => t.trim().toUpperCase())
          .filter(Boolean),
      )
      .pipe(z.array(z.enum(TERMS)).min(1))
      .optional(),
    includeEndedTerms: BoolParamSchema.optional(),
    includeFull: BoolParamSchema.optional(),
    includeInterestLists: BoolParamSchema.optional(),
  })
  .strict();

/** A GET parameter's value as the POST body's field takes it. */
type ReadParam = (params: URLSearchParams, key: string) => unknown;

/**
 * Numbers must be written in digits: Number() would take "0x7EA", "1e1"
 * and "" (as 0). Anything else is only converted here, and the schema
 * rejects what it cannot take (bool passes "maybe" through for it).
 */
const digits =
  (re: RegExp, what: string): ReadParam =>
  (params, key) => {
    const v = params.get(key)!;
    if (!re.test(v.trim())) {
      throw new ApiError(`${key} must be ${what}, got "${echo(v)}".`);
    }
    return Number(v);
  };
const int = digits(INTEGER_RE, 'a whole number in digits');
const num = digits(DECIMAL_RE, 'a number in digits, e.g. 3 or 3.5');
const str: ReadParam = (params, key) => params.get(key);
const bool: ReadParam = (params, key) => {
  const v = params.get(key)!;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return v;
};
/** Repeated or comma-separated: `term=A,B` or `term=A&term=B`. */
const list: ReadParam = (params, key) =>
  params
    .getAll(key)
    .flatMap(v => v.split(','))
    .map(v => v.trim())
    .filter(Boolean);
const upperList: ReadParam = (params, key) =>
  (list(params, key) as string[]).map(v => v.toUpperCase());

const yearOrAll: ReadParam = (params, key) =>
  /^all$/i.test(params.get(key)!) ? 'all' : int(params, key);

/** "unknown" alone: only the courses with no category on record. */
const offeringPattern: ReadParam = (params, key) => {
  const values = list(params, key) as string[];
  return {
    categories: values
      .filter(v => v.toLowerCase() !== 'unknown')
      .map(v => (INTEGER_RE.test(v) ? Number(v) : v)),
    includeUnknown:
      values.some(v => v.toLowerCase() === 'unknown') || undefined,
  };
};

const timesJson: ReadParam = (params, key) => {
  let times: unknown;
  try {
    times = JSON.parse(params.get(key)!) as unknown;
  } catch {
    throw new ApiError('times must be JSON');
  }
  if (!times || typeof times !== 'object' || Array.isArray(times)) {
    throw new ApiError(
      'times must be a JSON object, e.g. {"mode":"avoid","earliestStart":"13:00"}',
    );
  }
  return times;
};

const crns: ReadParam = (params, key) =>
  (list(params, key) as string[]).map(v => {
    if (!INTEGER_RE.test(v)) {
      throw new ApiError(`${key} takes CRNs in digits, got "${echo(v)}".`);
    }
    return Number(v);
  });

interface CourseParam {
  /** Where the value goes in the POST body. */
  to: string[];
  read: ReadParam;
  /** The parameter it qualifies, which must be given with it. */
  needs?: string;
}

/**
 * GET /courses's parameters, each mapped onto a field of the POST body, so
 * both go through the one CourseQuerySchema. In order: `times` (a JSON
 * object) comes before the shorthand fields that are set into it.
 */
const COURSE_PARAMS: Record<string, CourseParam> = {
  q: { to: ['filters', 'searchText', 'query'], read: str },
  professorOnly: {
    to: ['filters', 'searchText', 'professorOnly'],
    read: bool,
    needs: 'q',
  },
  department: { to: ['filters', 'department', 'departments'], read: list },
  term: { to: ['filters', 'term', 'terms'], read: upperList },
  year: { to: ['filters', 'academicYear', 'year'], read: yearOrAll },
  availableOnly: {
    to: ['filters', 'availability', 'availableOnly'],
    read: bool,
  },
  minAvailable: { to: ['filters', 'availability', 'minAvailable'], read: int },
  maxWaitlisted: {
    to: ['filters', 'availability', 'maxWaitlisted'],
    read: int,
  },
  minLevel: { to: ['filters', 'courseLevel', 'min'], read: int },
  maxLevel: { to: ['filters', 'courseLevel', 'max'], read: int },
  degreeAttribute: {
    to: ['filters', 'degreeAttribute', 'attributes'],
    read: list,
  },
  deliveryMode: { to: ['filters', 'deliveryMode', 'modes'], read: list },
  offeringPattern: {
    to: ['filters', 'offeringPattern'],
    read: offeringPattern,
  },
  minCredits: { to: ['filters', 'creditRange', 'min'], read: num },
  maxCredits: { to: ['filters', 'creditRange', 'max'], read: num },
  level: { to: ['filters', 'graduateLevel', 'level'], read: str },
  times: { to: ['filters', 'times'], read: timesJson },
  earliestStart: { to: ['filters', 'times', 'earliestStart'], read: str },
  latestEnd: { to: ['filters', 'times', 'latestEnd'], read: str },
  days: { to: ['filters', 'times', 'days'], read: upperList },
  includeAsync: { to: ['filters', 'times', 'includeAsync'], read: bool },
  ...Object.fromEntries(
    RMP_BOUNDS.map(k => [
      k,
      {
        to: ['filters', 'rmpRating', k],
        read: k === 'minNumRatings' ? int : num,
      },
    ]),
  ),
  includeWithoutData: {
    to: ['filters', 'rmpRating', 'includeWithoutData'],
    read: bool,
  },
  avoidCrns: { to: ['filters', 'periodConflict', 'crns'], read: crns },
  semesterSpansQuarters: {
    to: ['filters', 'periodConflict', 'semesterSpansQuarters'],
    read: bool,
    needs: 'avoidCrns',
  },
  includeEndedTerms: { to: ['includeEndedTerms'], read: bool },
  includeInterestLists: { to: ['includeInterestLists'], read: bool },
  includeSections: { to: ['includeSections'], read: bool },
  sort: { to: ['sort'], read: str },
  offset: { to: ['offset'], read: int },
  limit: { to: ['limit'], read: int },
};

type Body = Record<string, unknown>;

/** Sets `value` at `path`, making the objects on the way. */
function setAt(body: Body, path: string[], value: unknown): void {
  let at = body;
  for (const key of path.slice(0, -1)) {
    at = (at[key] ??= {}) as Body;
  }
  at[path[path.length - 1]] = value;
}

/** Query parameters turned into the POST body's shape (COURSE_PARAMS). */
function courseQueryFromParams(params: URLSearchParams): unknown {
  const unknown = [...new Set(params.keys())].filter(
    k => !Object.hasOwn(COURSE_PARAMS, k),
  );
  if (unknown.length > 0) {
    throw new ApiError(`Unknown parameter: ${unknown.map(echo).join(', ')}`);
  }
  const body: Body = { filters: {} };
  for (const [key, { to, read, needs }] of Object.entries(COURSE_PARAMS)) {
    if (!params.has(key)) continue;
    if (needs && !params.has(needs)) {
      throw new ApiError(`${key} needs ${needs}: it qualifies it.`);
    }
    setAt(body, to, read(params, key));
  }
  // An open end is no bound: minCredits=200 alone is 200 and up.
  const credits = (body.filters as Body).creditRange as
    { min?: number; max?: number } | undefined;
  if (credits) {
    credits.min ??= 0;
    credits.max ??= Math.max(100, credits.min);
  }
  return body;
}

function searchCourses(catalog: Catalog, input: unknown) {
  return runCourseQuery(catalog, parseOrThrow(CourseQuerySchema, input));
}

interface RouteContext {
  request: Request;
  url: URL;
  /** The path's regex match, for a route keyed by one. */
  match: RegExpExecArray | null;
  getCatalog: () => Promise<Catalog>;
}

interface Route {
  path: string | RegExp;
  method: 'GET' | 'POST';
  handle: (context: RouteContext) => Promise<Response> | Response;
}

// Tried in order: /courses/search before the /courses/:id pattern.
const ROUTES: Route[] = [
  {
    path: '/health',
    method: 'GET',
    handle: ({ url }) => {
      onlyParams(url.searchParams, []);
      return json({ ok: true });
    },
  },
  {
    path: '/meta',
    method: 'GET',
    handle: async ({ url, getCatalog }) => {
      onlyParams(url.searchParams, []);
      return json(catalogMeta(await getCatalog()));
    },
  },
  {
    path: '/departments',
    method: 'GET',
    handle: async ({ url, getCatalog }) => {
      onlyParams(url.searchParams, ['year']);
      const year = url.searchParams.has('year')
        ? parseOrThrow(YearOrAllParamSchema, url.searchParams.get('year'))
        : undefined;
      return json({ departments: listDepartments(await getCatalog(), year) });
    },
  },
  {
    path: '/courses',
    method: 'GET',
    handle: async ({ url, getCatalog }) => {
      const input = courseQueryFromParams(url.searchParams);
      return json(searchCourses(await getCatalog(), input));
    },
  },
  {
    path: '/courses/search',
    method: 'POST',
    handle: async ({ request, getCatalog }) => {
      const input = await readBody(request);
      return json(searchCourses(await getCatalog(), input));
    },
  },
  {
    path: /^\/courses\/([^/]+)$/,
    method: 'GET',
    handle: async ({ url, match, getCatalog }) => {
      const options = parseOrThrow(
        DetailParamsSchema,
        Object.fromEntries(url.searchParams),
      );
      let id: string;
      try {
        id = decodeURIComponent(match![1]);
      } catch {
        throw new ApiError('The course in the path is not valid URL encoding.');
      }
      const found = lookupCourse(await getCatalog(), id, options);
      // A year not yet published answers with the outlook instead.
      return json(
        found.kind === 'course'
          ? { ...found.detail, notices: found.notices }
          : { ...found.plan, notices: found.notices },
      );
    },
  },
  {
    path: '/conflicts',
    method: 'POST',
    handle: async ({ request, getCatalog }) => {
      const { crns, busy } = parseOrThrow(
        ConflictCheckInputSchema,
        await readBody(request),
      );
      return json(findConflicts(await getCatalog(), crns, busy));
    },
  },
];

async function route(
  request: Request,
  path: string,
  url: URL,
  getCatalog: () => Promise<Catalog>,
): Promise<Response> {
  for (const { path: key, method, handle } of ROUTES) {
    const match = typeof key === 'string' ? null : key.exec(path);
    if (key !== path && !match) continue;
    if (request.method !== method) {
      return json(
        {
          error: `${path} takes ${method}${path === '/courses/search' ? '; GET /courses takes the search as query parameters' : ''}.`,
        },
        405,
        { Allow: `${method}, OPTIONS` },
      );
    }
    return handle({ request, url, match, getCatalog });
  }
  throw new ApiError('Not found', 404);
}

/**
 * The route version, in every path: `{basePath}/api/v1/courses`. Within
 * one, responses only gain fields; renaming or removing one, or changing
 * what a field holds, is a new version.
 */
export const API_VERSION = 'v1';

/**
 * Handles everything under `{basePath}/api`; returns null for other paths so
 * the server can try its other handlers.
 */
export function createApiHandler(options: {
  basePath: string;
  getCatalog: () => Promise<Catalog>;
}): (request: Request) => Promise<Response | null> {
  const root = `${options.basePath}/api`;
  const prefix = `${root}/${API_VERSION}`;
  const under = (path: string, base: string) =>
    path === base || path.startsWith(`${base}/`);

  return async request => {
    const url = new URL(request.url);
    if (!under(url.pathname, root)) return null;
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (!under(url.pathname, prefix)) {
      return json(
        {
          error: `The API's routes are under ${prefix}, e.g. ${prefix}/courses.`,
        },
        404,
      );
    }

    const path = url.pathname.slice(prefix.length).replace(/\/$/, '');
    try {
      return await route(request, path, url, options.getCatalog);
    } catch (error) {
      if (error instanceof ApiError) {
        return json(
          { error: error.message, details: error.details },
          error.status,
        );
      }
      logger.error('[api] Request failed:', error);
      return json({ error: 'Internal server error' }, 500);
    }
  };
}
