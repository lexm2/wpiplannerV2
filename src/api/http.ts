/**
 * The course API's routes, as a web-standard (Request) => Response handler.
 * Every route is a read over the public catalog and answers JSON. See
 * docs/api.md for the routes and query parameters.
 */
import * as z from 'zod';
import type { Catalog } from './catalog';
import { CourseQuerySchema, runCourseQuery } from './query';
import { findConflicts } from './conflicts';
import { catalogMeta, listDepartments, lookupCourse } from './lookup';
import { ApiError } from './errors';
import { logger } from '../utils/logger';

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      ...CORS_HEADERS,
    },
  });
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

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

const YearParamSchema = z.coerce.number().int().min(2000).max(2100);
const YearOrAllParamSchema = z.union([z.literal('all'), YearParamSchema]);

const ConflictsBodySchema = z
  .object({ crns: z.array(z.number().int().positive()).min(1).max(100) })
  .strict();

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
      .pipe(z.array(z.enum(['A', 'B', 'C', 'D', 'F', 'S'])).min(1))
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
  'includeAsync',
  'includeInterestLists',
  'includeEndedTerms',
  'includeSections',
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
  const num = (k: string) =>
    params.has(k) ? Number(params.get(k)) : undefined;
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
    const year = str('year');
    filters.academicYear = { year: year === 'all' ? 'all' : Number(year) };
  }
  if (
    params.has('availableOnly') ||
    params.has('minAvailable') ||
    params.has('maxWaitlisted')
  ) {
    filters.availability = {
      availableOnly: bool('availableOnly'),
      minAvailable: num('minAvailable'),
      maxWaitlisted: num('maxWaitlisted'),
    };
  }
  if (params.has('minLevel') || params.has('maxLevel')) {
    filters.courseLevel = { min: num('minLevel'), max: num('maxLevel') };
  }
  if (params.has('degreeAttribute')) {
    filters.degreeAttribute = { attributes: list('degreeAttribute') };
  }
  if (params.has('deliveryMode')) {
    filters.deliveryMode = { modes: list('deliveryMode') };
  }
  if (params.has('offeringPattern')) {
    const values = list('offeringPattern');
    filters.offeringPattern = {
      categories: values.filter(v => v !== 'unknown').map(Number),
      includeUnknown: values.includes('unknown') || undefined,
    };
  }
  if (params.has('minCredits') || params.has('maxCredits')) {
    filters.creditRange = {
      min: num('minCredits') ?? 0,
      max: num('maxCredits') ?? 100,
    };
  }
  if (params.has('level')) {
    filters.graduateLevel = { level: str('level') };
  }
  if (params.has('times')) {
    try {
      filters.times = JSON.parse(params.get('times')!) as unknown;
    } catch {
      throw new HttpError(400, 'times must be JSON');
    }
  }
  if (
    params.has('earliestStart') ||
    params.has('latestEnd') ||
    params.has('includeAsync')
  ) {
    filters.times = {
      ...(filters.times as object | undefined),
      earliestStart: str('earliestStart'),
      latestEnd: str('latestEnd'),
      includeAsync: bool('includeAsync'),
    };
  }
  if (RMP_PARAMS.some(k => params.has(k)) || params.has('includeWithoutData')) {
    filters.rmpRating = {
      ...Object.fromEntries(RMP_PARAMS.map(k => [k, num(k)])),
      includeWithoutData: bool('includeWithoutData'),
    };
  }
  if (params.has('avoidCrns')) {
    filters.periodConflict = {
      crns: list('avoidCrns').map(Number),
      semesterSpansQuarters: bool('semesterSpansQuarters'),
    };
  }

  return {
    filters,
    includeEndedTerms: bool('includeEndedTerms'),
    includeInterestLists: bool('includeInterestLists'),
    includeSections: bool('includeSections'),
    offset: num('offset'),
    limit: num('limit'),
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

  if (path === '/health' && method === 'GET') {
    return json({ ok: true });
  }

  if (path === '/meta' && method === 'GET') {
    return json(catalogMeta(await getCatalog()));
  }

  if (path === '/departments' && method === 'GET') {
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
    const id = decodeURIComponent(courseMatch[1]);
    const found = lookupCourse(await getCatalog(), id, options);
    // A year not yet published answers with the outlook instead.
    return json(
      found.kind === 'course'
        ? { ...found.detail, notices: found.notices }
        : { ...found.plan, notices: found.notices },
    );
  }

  if (path === '/conflicts' && method === 'POST') {
    const { crns } = parseOrThrow(ConflictsBodySchema, await readBody(request));
    return json(findConflicts(await getCatalog(), crns));
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
