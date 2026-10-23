/**
 * The course catalog as an MCP server, for students' AI assistants. Every
 * tool is a thin wrapper over the same src/api functions the HTTP routes
 * call; nothing here filters or looks anything up on its own. Text content
 * is a compact rendering (src/mcp/render.ts); structuredContent carries the
 * same result as data, for get_course trimmed to what the text shows.
 */
import * as z from 'zod';
import {
  createMcpHandler,
  McpServer,
  type McpHttpHandler,
} from '@modelcontextprotocol/server';
import { currentAcademicYear, type Catalog } from '../api/catalog';
import {
  seatDataAge,
  termDates,
  today,
  yearLabel,
  yearStatus,
} from '../api/calendar';
import { CourseQuerySchema, runCourseQuery, TERMS } from '../api/query';
import { caseless } from '../api/schemaHints';
import { ConflictCheckInputSchema, findConflicts } from '../api/conflicts';
import { ApiError } from '../api/errors';
import { logger } from '../utils/logger';
import {
  catalogMeta,
  listDepartments,
  lookupCourse,
  MAX_COURSE_INPUT,
} from '../api/lookup';
import {
  conflictData,
  courseDigest,
  renderCatalogInfo,
  renderConflicts,
  renderCourse,
  renderPlan,
  renderSearch,
} from './render';

const INSTRUCTIONS = `\
The course catalog of WPI (Worcester Polytechnic Institute), with the same data \
and filters as the WPI course planner web app: every course and section with \
meeting times, seats, instructors with Rate My Professor ratings, degree \
attributes and offering patterns, refreshed regularly from WPI's registration \
system. Read-only.

Calendar: the academic year is named by its fall year (2026 = fall 2026 \
through spring 2027). It has four 7-week terms, A and B in fall and C and D in \
spring. Some sections, mostly graduate ones, run a whole semester instead: F \
(A+B) or S (C+D). Days are M T W R F S U (R = Thursday); times are 24-hour.

Schedule this year, plan next year. Only the current academic year has a \
schedule (sections, times, CRNs, conflicts). WPI sets each year's terms and \
times when it publishes the schedule, so a later year can only be planned \
roughly, from a course's offering pattern: Cat. I = offered every year, \
Cat. II = at least every other year, Cat. III = occasionally, none on record = \
unknown (most graduate courses). get_course with a future year gives that \
outlook. Never state a term, time or instructor for an unpublished year as \
settled: the few early entries the catalog already lists for one are shown \
marked tentative, and cannot be registered for yet.

Credits: a standard WPI course is 1/3 unit, shown as 3 credits. A full-time \
undergraduate load is 3 courses (1 unit) per term.

Workflow:
1. get_catalog_info once: today's date and term, which years are published, \
term dates, degree attribute names.
2. search_courses for candidates by topic, department, term, degree attribute, \
open seats, times (filters.times.earliestStart/latestEnd, on filters.times.days \
for particular weekdays), ratings, or fit \
around CRNs already chosen \
(filters.periodConflict). Filtered searches list the matching sections with \
CRNs.
3. get_course for the description, prerequisites as stated, and this year's \
sections, labs and discussions listed once per term. Take one lecture plus one \
of each companion kind (lab, discussion) listed for it.
4. check_conflicts with all the chosen CRNs, lectures, labs and discussions: it \
reports time overlaps, labs or discussions that do not go with the chosen \
lecture, missing companions, and full, closed or ended sections.
list_departments gives department abbreviations.

Out of scope; say so rather than guess:
- Prerequisites are not structured or checked: there is only the description's \
own text. Quote it and hedge ("the catalog says...").
- No degree audit: degree attributes (e.g. Social Sciences) say what a course \
can count toward, not what a student still needs. The tags are incomplete in \
the data: a course without one may still count, so refer the student to their \
degree audit or advisor rather than ruling a course out.
- No registration: students register in WPI Workday with the CRNs.
- Policy (graduate credit, overloads, transfer credit, double counting): refer \
the student to the Registrar or their academic advisor.
- No exam, assessment or final exam information.

Seat counts are as of the last refresh (get_catalog_info's dataAsOf) and can \
lag. Quote CRNs and section numbers exactly.`;

const text = (value: string) => [{ type: 'text' as const, text: value }];

/**
 * Input errors go back to the model as text it can act on, not a protocol
 * error. Anything else is a bug: logged here in full, and the model gets a
 * generic line, never the internal message ("word.toLowerCase is not a
 * function") the SDK would otherwise put in the tool text.
 */
function failure(error: unknown, tool: string) {
  if (error instanceof ApiError) {
    return { content: text(error.message), isError: true };
  }
  logger.error(`[mcp] ${tool} failed:`, error);
  return {
    content: text(
      `Internal error while running ${tool}; try a simpler query, or try again later.`,
    ),
    isError: true,
  };
}

const YearInputSchema = z
  .number()
  .int()
  .min(2000)
  .max(2100)
  .describe('Academic year by its fall year: 2026 means 2026-27.');

function buildServer(getCatalog: () => Promise<Catalog>): McpServer {
  const server = new McpServer(
    { name: 'wpi-courses', version: '2.0.0' },
    {
      instructions: INSTRUCTIONS,
      // One fresh server per request: there is no session to tell of a
      // changed tool list.
      capabilities: { tools: { listChanged: false } },
    },
  );

  server.registerTool(
    'search_courses',
    {
      title: 'Search courses',
      description:
        "Search the catalog with the course planner's filters; every filter given must match. A course is kept when at least " +
        'one lecture group passes all of them, and its seat counts and listed sections are then only the matching ones. ' +
        'Defaults to the current academic year, without sections of terms that have ended. Ranked by relevance with ' +
        'searchText, else by department and number. Cross-listed duplicates (same CRNs under two codes) show once, ' +
        'with "also listed as". Each row\'s "top" instructor ranks those with 5+ ratings above those with fewer, then by rating ' +
        '(under sort "difficulty", the "easiest rated" instead, by difficulty). ' +
        'Returns a page (default 25), the total, and the open seats over every match.',
      inputSchema: CourseQuerySchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async query => {
      try {
        const result = runCourseQuery(await getCatalog(), query);
        return {
          content: text(renderSearch(result)),
          structuredContent: { ...result },
        };
      } catch (error) {
        return failure(error, 'search_courses');
      }
    },
  );

  server.registerTool(
    'get_course',
    {
      title: 'Get course details',
      description:
        'One course: description, prerequisites and background as stated, offering pattern, degree attributes, ' +
        'cross-listings, and its sections by term (CRN, days/times, room, instructor with rating, seats, waitlist), ' +
        'each lab and discussion listed once with the lectures it pairs with. By default shows terms not yet ended ' +
        'and hides interest-list placeholders, saying what it left out. With a year whose schedule is not published, ' +
        'returns the outlook for that year instead (likely, possible, uncertain or unknown), from the offering pattern. ' +
        'Read-only; registration is in Workday.',
      inputSchema: z
        .object({
          course: z
            .string()
            .trim()
            .min(1)
            .max(MAX_COURSE_INPUT)
            .describe(
              'A course code ("CS 2102", "CS2102"), catalog id ("CS-2102-2026"), a section CRN ("350041" or "CRN 350041"), or a course title ("Critical AI Literacy"; resolved when one title is or starts with it, else the closest are suggested).',
            ),
          year: YearInputSchema.optional().describe(
            'Academic year (fall year). Omitted: the current year. A future unpublished year (e.g. next year) returns the planning outlook.',
          ),
          terms: z
            .array(caseless(TERMS))
            .min(1)
            .optional()
            .describe(
              'Only these terms, ended or not. Default: every term that has not ended.',
            ),
          includeEndedTerms: z
            .boolean()
            .default(false)
            .describe('Also show terms that have already ended.'),
          includeFull: z
            .boolean()
            .default(true)
            .describe('Default true. False hides sections with no open seat.'),
          includeInterestLists: z
            .boolean()
            .default(false)
            .describe(
              'Show interest-list placeholder sections (no times; for joining a waitlist before sections open).',
            ),
        })
        .strict(),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ course, ...options }) => {
      try {
        const catalog = await getCatalog();
        const found = lookupCourse(catalog, course, options);
        if (found.kind === 'plan') {
          return {
            content: text(renderPlan(found.plan, found.notices)),
            structuredContent: { ...found.plan, notices: found.notices },
          };
        }
        const { detail } = found;
        const year = detail.year ?? currentAcademicYear(catalog);
        const seatData = {
          dataAsOf: catalog.lastUpdated,
          dataAgeDays: seatDataAge(catalog),
        };
        const dates = termDates(catalog, year);
        return {
          content: text(
            renderCourse(detail, found.notices, {
              ...seatData,
              termDates: dates,
              today: today(catalog),
            }),
          ),
          structuredContent: courseDigest(
            detail,
            found.notices,
            seatData,
            dates,
          ),
        };
      } catch (error) {
        return failure(error, 'get_course');
      }
    },
  );

  server.registerTool(
    'list_departments',
    {
      title: 'List departments',
      description:
        'Departments with courses in an academic year: abbreviation (for search_courses filters.department), name and course count.',
      inputSchema: z
        .object({
          year: z
            .union([YearInputSchema, z.literal('all')])
            .optional()
            .describe('Fall year, or "all"; defaults to the current year.'),
        })
        .strict(),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ year }) => {
      try {
        const catalog = await getCatalog();
        const departments = listDepartments(catalog, year);
        const lines: string[] = [];
        if (year === 'all') lines.push('Departments in any year:');
        else {
          const y = year ?? currentAcademicYear(catalog);
          const status = yearStatus(catalog, y);
          lines.push(`Departments with courses in ${yearLabel(y)}:`);
          if (status.status === 'not yet published') {
            lines.push(
              `${yearLabel(y)} is not published yet; these are only early entries (${status.courseCount} course${status.courseCount === 1 ? '' : 's'}).`,
            );
          }
        }
        lines.push(
          ...departments.map(d => `${d.abbr} ${d.name} (${d.courseCount})`),
        );
        return {
          content: text(lines.join('\n')),
          structuredContent: { departments },
        };
      } catch (error) {
        return failure(error, 'list_departments');
      }
    },
  );

  server.registerTool(
    'get_catalog_info',
    {
      title: 'Catalog info',
      description:
        'Today and the current term (or the terms either side of today), the current academic year, when the data was ' +
        'refreshed, each year with its course count and status (current, published, not yet published, past), term ' +
        'and semester dates, and the degree attribute and delivery mode values filters accept. A future year counts ' +
        'as published once it lists at least a quarter as many courses as the current year; fewer means only early ' +
        'entries are in.',
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const meta = catalogMeta(await getCatalog());
        return {
          content: text(renderCatalogInfo(meta)),
          structuredContent: { ...meta },
        };
      } catch (error) {
        return failure(error, 'get_catalog_info');
      }
    },
  );

  server.registerTool(
    'check_conflicts',
    {
      title: 'Check a schedule',
      description:
        'Checks chosen CRNs as a schedule. Time conflicts, with the days and times each conflicting pair shares (a ' +
        'semester section, F or S, overlaps both of its quarters). Problems: a lab or discussion that does not go ' +
        'with a chosen lecture, two lectures of one course, interest-list placeholders, ended terms, closed sections. ' +
        'Notes: a lecture missing a lab or discussion it needs, full or waitlisted sections, 3 or fewer seats left. ' +
        'CRNs not in the catalog are listed as problems and the rest still checked. With busy blocks (a work shift: ' +
        '{days: ["T", "R"], start: "13:00", end: "17:00", label: "work"}), every section meeting during one is reported. ' +
        'Read-only; registration is in Workday.',
      inputSchema: ConflictCheckInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ crns, busy }) => {
      try {
        const check = findConflicts(await getCatalog(), crns, busy);
        return {
          content: text(renderConflicts(check)),
          structuredContent: conflictData(check),
        };
      } catch (error) {
        return failure(error, 'check_conflicts');
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
