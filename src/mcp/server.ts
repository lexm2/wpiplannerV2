/**
 * The course catalog as an MCP server, for students' AI assistants. Every
 * tool is a thin wrapper over the same src/api functions the HTTP routes
 * call; nothing here filters or looks anything up on its own.
 */
import * as z from 'zod';
import {
  createMcpHandler,
  McpServer,
  type McpHttpHandler,
} from '@modelcontextprotocol/server';
import type { Catalog } from '../api/catalog';
import { CourseQuerySchema, runCourseQuery } from '../api/query';
import { findConflicts, UnknownCrnError } from '../api/conflicts';
import { catalogMeta, findCourse, listDepartments } from '../api/lookup';
import { toCourseDetail, type CourseSummary } from '../api/serialize';

const INSTRUCTIONS = `\
This server is the course catalog of WPI (Worcester Polytechnic Institute), \
the same data and filters as the WPI course planner web app: every course and \
section with meeting times, seats, instructors and Rate My Professor ratings, \
refreshed regularly from WPI's registration system (get_catalog_info says \
when). It is read-only.

WPI's calendar: the academic year is named by its fall year (2026 means fall \
2026 through spring 2027) and has four 7-week quarters, A and B in fall, C and \
D in spring. Some sections, mostly graduate ones, run a whole semester instead: \
F (fall, spanning A and B) or S (spring, spanning C and D). A full-time \
undergraduate load is typically three courses per quarter.

To help a student pick courses:
1. Call get_catalog_info once for the current academic year and term dates.
2. Find candidates with search_courses (by topic, department, term, open \
seats, meeting times, ratings). It returns compact summaries.
3. Call get_course on the promising ones for the description, every section's \
meeting times, CRNs and seat counts, and instructor ratings. A lecture may \
come with discussions or labs; the student takes the lecture plus one of each \
kind listed with it.
4. Once the student has chosen sections, pass their CRNs to check_conflicts \
to confirm none of them overlap. To search only for courses that fit around \
sections they already have, give those CRNs to search_courses as \
filters.periodConflict.crns.

Quote CRNs and section numbers exactly; students register with them.`;

const text = (value: string) => [{ type: 'text' as const, text: value }];

function summaryLine(c: CourseSummary): string {
  const credits =
    c.credits.min === c.credits.max
      ? `${c.credits.max} cr`
      : `${c.credits.min}-${c.credits.max} cr`;
  const terms = c.terms.length ? `terms ${c.terms.join(',')}` : 'no terms';
  const profs = c.professors.length ? ` | ${c.professors.join('; ')}` : '';
  const grad = c.isGraduate ? ' | graduate' : '';
  return `${c.code} ${c.name} [${c.id}] | ${credits} | ${terms} | ${c.seats.available}/${c.seats.capacity} seats open${grad}${profs}`;
}

/** Tool errors go back to the model as text it can act on, not a protocol error. */
function failure(error: unknown) {
  if (error instanceof UnknownCrnError) {
    return {
      content: text(
        `${error.message}. Get CRNs from get_course; they are the "crn" field of each section.`,
      ),
      isError: true,
    };
  }
  throw error;
}

function buildServer(getCatalog: () => Promise<Catalog>): McpServer {
  const server = new McpServer(
    { name: 'wpi-courses', version: '1.0.0' },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    'search_courses',
    {
      title: 'Search courses',
      description:
        'Search the WPI catalog with the same filters as the course planner. ' +
        'Every filter given must match; a course is kept when at least one ' +
        'of its sections passes all of them, and its summary then counts ' +
        'only those sections. With a searchText query, results are ranked ' +
        'by relevance; otherwise sorted by department and course number. ' +
        'Defaults to the current academic year. Returns one page (default ' +
        '25) and the total: raise offset by limit to page on.',
      inputSchema: CourseQuerySchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async query => {
      try {
        const result = runCourseQuery(await getCatalog(), query);
        const last = Math.min(result.offset + result.limit, result.total);
        const header =
          result.total === 0
            ? 'No matching courses.'
            : `Courses ${result.offset + 1}-${last} of ${result.total}:`;
        return {
          content: text(
            [header, ...result.courses.map(summaryLine)].join('\n'),
          ),
          structuredContent: { ...result },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'get_course',
    {
      title: 'Get course details',
      description:
        'One course in full: description, credits, every lecture with its ' +
        'discussions and labs, each section with CRN, term, seats and ' +
        'meeting times (days as letters M T W R F S U, R is Thursday; times ' +
        'as 24-hour HH:MM), and Rate My Professor ratings for its instructors.',
      inputSchema: z
        .object({
          course: z
            .string()
            .min(1)
            .describe(
              'A catalog id from search_courses ("CS-2102-2026") or a course code ("CS 2102", "CS2102").',
            ),
          year: z
            .number()
            .int()
            .optional()
            .describe(
              'Academic year (fall year) for a course code, matched exactly. Omitted: the current year, else the newest year offering it.',
            ),
        })
        .strict(),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ course, year }) => {
      const catalog = await getCatalog();
      const found = findCourse(catalog, course, year);
      if (!found) {
        return {
          content: text(
            `No course ${course}. Try search_courses to find its id.`,
          ),
          isError: true,
        };
      }
      const detail = toCourseDetail(found, catalog.rmp);
      return {
        content: text(JSON.stringify(detail)),
        structuredContent: { ...detail },
      };
    },
  );

  server.registerTool(
    'list_departments',
    {
      title: 'List departments',
      description:
        'Every department with courses in an academic year: abbreviation (use it in search_courses filters.department), name and course count.',
      inputSchema: z
        .object({
          year: z
            .union([z.number().int(), z.literal('all')])
            .optional()
            .describe(
              'Academic year (fall year), or "all"; defaults to the current year.',
            ),
        })
        .strict(),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ year }) => {
      const departments = listDepartments(await getCatalog(), year);
      return {
        content: text(
          departments
            .map(d => `${d.abbr} ${d.name} (${d.courseCount})`)
            .join('\n'),
        ),
        structuredContent: { departments },
      };
    },
  );

  server.registerTool(
    'get_catalog_info',
    {
      title: 'Catalog info',
      description:
        "The current academic year, the years in the catalog, each year's A-D term start and end dates, and when the data was last refreshed.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const meta = catalogMeta(await getCatalog());
      return {
        content: text(JSON.stringify(meta)),
        structuredContent: { ...meta },
      };
    },
  );

  server.registerTool(
    'check_conflicts',
    {
      title: 'Check time conflicts',
      description:
        'Which of the given sections meet at overlapping times. Only ' +
        'sections whose terms overlap can conflict; a semester section (F ' +
        'or S) overlaps both of its quarters. Returns the conflicting pairs; ' +
        'an empty list means the sections fit together.',
      inputSchema: z
        .object({
          crns: z
            .array(z.number().int().positive())
            .min(2)
            .max(100)
            .describe('CRNs of the sections to check, from get_course.'),
        })
        .strict(),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ crns }) => {
      try {
        const conflicts = findConflicts(await getCatalog(), crns);
        const lines = conflicts.map(
          ({ a, b }) =>
            `${a.courses.join('/')} ${a.section} (CRN ${a.crn}, ${a.term}) conflicts with ${b.courses.join('/')} ${b.section} (CRN ${b.crn}, ${b.term})`,
        );
        return {
          content: text(
            lines.length
              ? lines.join('\n')
              : 'No conflicts: these sections fit together.',
          ),
          structuredContent: { conflicts },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}

/** The MCP endpoint: stateless, one fresh server per request. */
export function createMcpEndpoint(
  getCatalog: () => Promise<Catalog>,
): McpHttpHandler {
  return createMcpHandler(() => buildServer(getCatalog));
}
