/**
 * The course API's routes, as a web-standard (Request) => Response handler.
 * Every route is a read over the public catalog and answers JSON. See
 * docs/api.md for the routes and query parameters.
 */
import * as z from 'zod';
import type { Catalog } from './catalog';
import { CourseQuerySchema, runCourseQuery, TERMS } from './query';
import { ConflictCheckInputSchema, findConflicts } from './conflicts';
import { catalogMeta, listDepartments, lookupCourse } from './lookup';
import { ApiError, echo } from './errors';
import { logger } from '../utils/logger';

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

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** The method each route answers, for 405s on the others. */
function allowedMethod(path: string): 'GET' | 'POST' | null {
  if (path === '/courses/search' || path === '/conflicts') return 'POST';
  if (['/health', '/meta', '/departments', '/courses'].includes(path)) {
    return 'GET';
  }
  return /^\/courses\/[^/]+$/.test(path) ? 'GET' : null;
}

/** Refuses any query parameter but `allowed`, as GET /courses does. */
function onlyParams(params: URLSearchParams, allowed: string[]): void {
  const unknown = [...new Set(params.keys())].filter(k => !allowed.includes(k));
  if (unknown.length > 0) {
    throw new HttpError(
      400,
      `Unknown parameter: ${unknown.map(echo).join(', ')}${allowed.length ? `. Accepted: ${allowed.join(', ')}` : '; this route takes none'}.`,
    );
  }
}

/** Plain decimal digits: no hex, exponent, sign or blank ("0x7EA", "1e1", ""). */
const INTEGER_RE = /^\d+$/;
const DECIMAL_RE = /^\d+(\.\d+)?$/;

const notFound = () => new HttpError(404, 'Not found');

function parseOrThrow<T extends z.ZodType>(
  schema: T,
  input: unknown,
): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(400, 'Invalid request', result.error.issues);
  }
  return result.data;
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new HttpError(400, 'Request body must be JSON');
  }
}

const YearParamSchema = z
  .string()
  .regex(/^\d{4}$/, 'year is a four-digit fall year, e.g. 2026')
  .transform(Number)
  .pipe(z.number().int().min(2000).max(2100));
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

// GET /api/courses parameter names, each mapped onto the query's shape.
const COURSE_PARAMS = new Set([
  'q',
  'professorOnly',
  'department',
  'term',
  'year',
  'availableOnly',
  'minAvailable',
  'minCredits',
  'maxCredits',
  'level',
  'times',
  'minRating',
  'maxRating',
  'minDifficulty',
  'maxDifficulty',
  'minWouldTakeAgain',
  'maxWouldTakeAgain',
  'minNumRatings',
  'includeWithoutData',
  'avoidCrns',
  'semesterSpansQuarters',
  'maxWaitlisted',
  'minLevel',
  'maxLevel',
  'degreeAttribute',
  'deliveryMode',
  'offeringPattern',
  'earliestStart',
  'latestEnd',
  'days',
  'includeAsync',
  'includeInterestLists',
  'includeEndedTerms',
  'includeSections',
  'sort',
  'offset',
  'limit',
]);

const RMP_PARAMS = [
  'minRating',
  'maxRating',
  'minDifficulty',
  'maxDifficulty',
  'minWouldTakeAgain',
  'maxWouldTakeAgain',
  'minNumRatings',
] as const;

/**
 * Query parameters turned into the POST body's shape, so both go through the
 * one CourseQuerySchema. Values are only converted here, never validated:
 * "abc" becomes NaN and the schema rejects it.
 */
function courseQueryFromParams(params: URLSearchParams): unknown {
  const unknown = [...params.keys()].filter(k => !COURSE_PARAMS.has(k));
  if (unknown.length > 0) {
    throw new HttpError(400, `Unknown parameter: ${unknown.join(', ')}`);
  }

  const str = (k: string) => params.get(k) ?? undefined;
  // Number() would take "0x7EA", "1e1" and "" (as 0); only digits count.
  const parse = (k: string, re: RegExp, what: string) => {
    const v = params.get(k);
    if (v === null) return undefined;
    if (!re.test(v.trim())) {
      throw new HttpError(400, `${k} must be ${what}, got "${echo(v)}".`);
    }
    return Number(v);
  };
  const int = (k: string) => parse(k, INTEGER_RE, 'a whole number in digits');
  const num = (k: string) =>
    parse(k, DECIMAL_RE, 'a number in digits, e.g. 3 or 3.5');
  const needs = (k: string, parent: string) => {
    if (params.has(k) && !params.has(parent)) {
      throw new HttpError(400, `${k} needs ${parent}: it qualifies it.`);
    }
  };
  needs('professorOnly', 'q');
  needs('semesterSpansQuarters', 'avoidCrns');
  const bool = (k: string) => {
    const v = params.get(k);
    if (v === null) return undefined;
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
    return v;
  };
  const list = (k: string) =>
    params
      .getAll(k)
      .flatMap(v => v.split(','))
      .map(v => v.trim())
      .filter(Boolean);

  const filters: Record<string, unknown> = {};

  if (params.has('q')) {
    filters.searchText = {
      query: str('q'),
      professorOnly: bool('professorOnly'),
    };
  }
  if (params.has('department')) {
    filters.department = { departments: list('department') };
  }
  if (params.has('term')) {
    filters.term = { terms: list('term').map(t => t.toUpperCase()) };
  }
  if (params.has('year')) {
    const year = str('year')!;
    filters.academicYear = {
      year: /^all$/i.test(year) ? 'all' : int('year'),
    };
  }
  if (
    params.has('availableOnly') ||
    params.has('minAvailable') ||
    params.has('maxWaitlisted')
  ) {
    filters.availability = {
      availableOnly: bool('availableOnly'),
      minAvailable: int('minAvailable'),
      maxWaitlisted: int('maxWaitlisted'),
    };
  }
  if (params.has('minLevel') || params.has('maxLevel')) {
    filters.courseLevel = { min: int('minLevel'), max: int('maxLevel') };
  }
  if (params.has('degreeAttribute')) {
    filters.degreeAttribute = { attributes: list('degreeAttribute') };
  }
  if (params.has('deliveryMode')) {
    filters.deliveryMode = { modes: list('deliveryMode') };
  }
  if (params.has('offeringPattern')) {
    const values = list('offeringPattern');
    // "unknown" alone: only the courses with no category on record.
    filters.offeringPattern = {
      categories: values
        .filter(v => v.toLowerCase() !== 'unknown')
        .map(v => (INTEGER_RE.test(v) ? Number(v) : v)),
      includeUnknown:
        values.some(v => v.toLowerCase() === 'unknown') || undefined,
    };
  }
  if (params.has('minCredits') || params.has('maxCredits')) {
    // An open end is no bound: minCredits=200 alone is 200 and up.
    const min = num('minCredits') ?? 0;
    filters.creditRange = { min, max: num('maxCredits') ?? Math.max(100, min) };
  }
  if (params.has('level')) {
    filters.graduateLevel = { level: str('level') };
  }
  if (params.has('times')) {
    let times: unknown;
    try {
      times = JSON.parse(params.get('times')!) as unknown;
    } catch {
      throw new HttpError(400, 'times must be JSON');
    }
    if (!times || typeof times !== 'object' || Array.isArray(times)) {
      throw new HttpError(
        400,
        'times must be a JSON object, e.g. {"mode":"avoid","earliestStart":"13:00"}',
      );
    }
    filters.times = times;
  }
  if (
    params.has('earliestStart') ||
    params.has('latestEnd') ||
    params.has('days') ||
    params.has('includeAsync')
  ) {
    filters.times = {
      ...(filters.times as object | undefined),
      earliestStart: str('earliestStart'),
      latestEnd: str('latestEnd'),
      days: params.has('days')
        ? list('days').map(d => d.toUpperCase())
        : undefined,
      includeAsync: bool('includeAsync'),
    };
  }
  if (RMP_PARAMS.some(k => params.has(k)) || params.has('includeWithoutData')) {
    filters.rmpRating = {
      ...Object.fromEntries(
        RMP_PARAMS.map(k => [k, k === 'minNumRatings' ? int(k) : num(k)]),
      ),
      includeWithoutData: bool('includeWithoutData'),
    };
  }
  if (params.has('avoidCrns')) {
    filters.periodConflict = {
      crns: list('avoidCrns').map(v => {
        if (!INTEGER_RE.test(v)) {
          throw new HttpError(
            400,
            `avoidCrns takes CRNs in digits, got "${echo(v)}".`,
          );
        }
        return Number(v);
      }),
      semesterSpansQuarters: bool('semesterSpansQuarters'),
    };
  }

  return {
    filters,
    includeEndedTerms: bool('includeEndedTerms'),
    includeInterestLists: bool('includeInterestLists'),
    includeSections: bool('includeSections'),
    sort: str('sort'),
    offset: int('offset'),
    limit: int('limit'),
  };
}

function searchCourses(catalog: Catalog, input: unknown) {
  return runCourseQuery(catalog, parseOrThrow(CourseQuerySchema, input));
}

async function route(
  request: Request,
  path: string,
  url: URL,
  getCatalog: () => Promise<Catalog>,
): Promise<Response> {
  const { method } = request;

  const allowed = allowedMethod(path);
  if (allowed && method !== allowed) {
    throw new HttpError(
      405,
      `${path} takes ${allowed}${path === '/courses/search' ? '; GET /courses takes the search as query parameters' : ''}.`,
      undefined,
      { Allow: `${allowed}, OPTIONS` },
    );
  }

  if (path === '/health' && method === 'GET') {
    onlyParams(url.searchParams, []);
    return json({ ok: true });
  }

  if (path === '/meta' && method === 'GET') {
    onlyParams(url.searchParams, []);
    return json(catalogMeta(await getCatalog()));
  }

  if (path === '/departments' && method === 'GET') {
    onlyParams(url.searchParams, ['year']);
    const year = url.searchParams.has('year')
      ? parseOrThrow(YearOrAllParamSchema, url.searchParams.get('year'))
      : undefined;
    return json({ departments: listDepartments(await getCatalog(), year) });
  }

  if (path === '/courses' && method === 'GET') {
    const input = courseQueryFromParams(url.searchParams);
    return json(searchCourses(await getCatalog(), input));
  }

  if (path === '/courses/search' && method === 'POST') {
    const input = await readBody(request);
    return json(searchCourses(await getCatalog(), input));
  }

  const courseMatch = /^\/courses\/([^/]+)$/.exec(path);
  if (courseMatch && method === 'GET') {
    const options = parseOrThrow(
      DetailParamsSchema,
      Object.fromEntries(url.searchParams),
    );
    let id: string;
    try {
      id = decodeURIComponent(courseMatch[1]);
    } catch {
      throw new HttpError(
        400,
        'The course in the path is not valid URL encoding.',
      );
    }
    const found = lookupCourse(await getCatalog(), id, options);
    // A year not yet published answers with the outlook instead.
    return json(
      found.kind === 'course'
        ? { ...found.detail, notices: found.notices }
        : { ...found.plan, notices: found.notices },
    );
  }

  if (path === '/conflicts' && method === 'POST') {
    const { crns, busy } = parseOrThrow(
      ConflictCheckInputSchema,
      await readBody(request),
    );
    return json(findConflicts(await getCatalog(), crns, busy));
  }

  throw notFound();
}

/**
 * Handles everything under `{basePath}/api`; returns null for other paths so
 * the server can try its other handlers.
 */
export function createApiHandler(options: {
  basePath: string;
  getCatalog: () => Promise<Catalog>;
}): (request: Request) => Promise<Response | null> {
  const prefix = `${options.basePath}/api`;

  return async request => {
    const url = new URL(request.url);
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) {
      return null;
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const path = url.pathname.slice(prefix.length).replace(/\/$/, '');
    try {
      return await route(request, path, url, options.getCatalog);
    } catch (error) {
      if (error instanceof HttpError) {
        return json(
          { error: error.message, details: error.details },
          error.status,
          error.headers,
        );
      }
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
