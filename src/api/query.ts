/**
 * A course search, as the HTTP API and the MCP server accept it, run through
 * the web app's own FilterService. `filters` is keyed by filter id with the
 * criteria shapes of src/types/filters.ts, so a filter panel's active filters
 * map onto it one to one. The only difference is periodConflict, which takes
 * the CRNs a student already has and turns them into blocked slots here.
 */
import * as z from 'zod';
import type { Course } from '../types/types';
import { DayOfWeek } from '../types/types';
import { AcademicTerm } from '../types/schedule';
import type {
  AcademicYearFilterCriteria,
  AvailabilityFilterCriteria,
  ConflictCriteria,
  CreditRangeFilterCriteria,
  DepartmentFilterCriteria,
  GraduateLevelFilterCriteria,
  RMPRatingFilterCriteria,
  SearchTextFilterCriteria,
  TermFilterCriteria,
  TimesFilterCriteria,
} from '../types/filters';
import { FilterService } from '../services/filtering/FilterService';
import {
  createDefaultFilters,
  SearchTextFilter,
} from '../core/filtering/filters';
import { canonicalWindows } from '../utils/timeWindows';
import { currentAcademicYear, type Catalog } from './catalog';
import { blockedSlotsForCrns } from './conflicts';
import { toCourseSummary, type CourseSummary } from './serialize';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

const TermSchema = z
  .enum([
    AcademicTerm.A,
    AcademicTerm.B,
    AcademicTerm.C,
    AcademicTerm.D,
    AcademicTerm.F,
    AcademicTerm.S,
  ])
  .describe(
    'A, B, C, D are the 7-week quarters (A and B in fall, C and D in spring). ' +
      'F and S are full fall and spring semester sections. Matching is exact: ' +
      'A does not match an F section.',
  );

const YearSchema = z
  .number()
  .int()
  .min(2000)
  .max(2100)
  .describe(
    'Academic year by its fall year: 2026 means 2026-27 (fall 2026 through spring 2027).',
  );

const TimeWindowSchema = z.object({
  day: z
    .enum(DayOfWeek)
    .describe('M, T, W, R (Thursday), F, S (Saturday) or U (Sunday)'),
  startMin: z
    .number()
    .int()
    .min(0)
    .max(1440)
    .describe('Window start in minutes after midnight: 10:00 AM is 600.'),
  endMin: z
    .number()
    .int()
    .min(0)
    .max(1440)
    .describe(
      'Window end in minutes after midnight, exclusive: 1:00 PM is 780.',
    ),
});

const FiltersSchema = z
  .object({
    searchText: z
      .object({
        query: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Words to look for in the course code ("CS2102"), name, description, department, instructor or room. Results come back ranked by relevance.',
          ),
        professorOnly: z
          .boolean()
          .optional()
          .describe('Match the query against instructor names only.'),
      })
      .strict()
      .optional(),
    department: z
      .object({
        departments: z
          .array(z.string().min(1))
          .min(1)
          .describe('Department abbreviations, e.g. ["CS", "MA"].'),
      })
      .strict()
      .optional(),
    term: z
      .object({ terms: z.array(TermSchema).min(1) })
      .strict()
      .optional()
      .describe(
        'Keep sections in any of these terms. To find everything running during A term, ask for ["A", "F"].',
      ),
    academicYear: z
      .object({ year: z.union([YearSchema, z.literal('all')]) })
      .strict()
      .optional()
      .describe(
        'Defaults to the current academic year. Pass "all" to search every year in the catalog.',
      ),
    availability: z
      .object({
        availableOnly: z
          .boolean()
          .describe('Keep only sections with an open seat.'),
        minAvailable: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Keep only sections with at least this many open seats.'),
      })
      .strict()
      .optional(),
    creditRange: z
      .object({
        min: z.number().min(0),
        max: z.number().min(0),
      })
      .strict()
      .refine(c => c.max >= c.min, 'max must be at least min')
      .optional()
      .describe(
        'Keep courses whose credit range overlaps [min, max]. Most WPI undergraduate courses are 3 credits.',
      ),
    graduateLevel: z
      .object({ level: z.enum(['all', 'undergraduate', 'graduate']) })
      .strict()
      .optional(),
    times: z
      .object({
        mode: z
          .enum(['only', 'avoid'])
          .describe(
            '"only": every meeting of a section must fall inside the windows. "avoid": drop sections with any meeting overlapping a window.',
          ),
        windows: z
          .array(TimeWindowSchema)
          .refine(
            ws => ws.every(w => w.startMin < w.endMin),
            'each window must end after it starts',
          )
          .describe(
            'Weekly time windows, one per day and band; give each weekday its own entry.',
          ),
        includeAsync: z
          .boolean()
          .optional()
          .describe(
            'Also keep sections with no scheduled meetings (async, TBD). Default false.',
          ),
      })
      .strict()
      .optional(),
    rmpRating: z
      .object({
        minRating: z.number().min(0).max(5).optional(),
        maxRating: z.number().min(0).max(5).optional(),
        minDifficulty: z.number().min(0).max(5).optional(),
        maxDifficulty: z.number().min(0).max(5).optional(),
        minWouldTakeAgain: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe('Percent of raters who would take the instructor again.'),
        maxWouldTakeAgain: z.number().min(0).max(100).optional(),
        includeWithoutData: z
          .boolean()
          .optional()
          .describe(
            'Keep sections whose instructors have no Rate My Professor data. Default true.',
          ),
      })
      .strict()
      .optional()
      .describe(
        'Rate My Professor bounds on 0-5 scales; a section passes when any of its instructors does.',
      ),
    periodConflict: z
      .object({
        crns: z
          .array(z.number().int().positive())
          .min(1)
          .describe(
            "CRNs of sections the student already has; sections that clash with any of them are dropped. A semester section clashes with both of its quarters' sections.",
          ),
        semesterSpansQuarters: z
          .boolean()
          .optional()
          .describe(
            'Default true: an F section conflicts with A and B, S with C and D. False compares terms exactly.',
          ),
      })
      .strict()
      .optional(),
  })
  .strict();

export const CourseQuerySchema = z
  .object({
    filters: FiltersSchema.default({}).describe(
      'Filters by id; every one given must match. Omit a filter to not restrict on it.',
    ),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Results to skip, for paging.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LIMIT)
      .default(DEFAULT_LIMIT)
      .describe(`Page size, 1-${MAX_LIMIT}; default ${DEFAULT_LIMIT}.`),
  })
  .strict();

export type CourseQuery = z.infer<typeof CourseQuerySchema>;
type CourseFilters = CourseQuery['filters'];

export interface CourseQueryResult {
  /** Matching courses across all pages. */
  total: number;
  offset: number;
  limit: number;
  courses: CourseSummary[];
}

/**
 * The FilterService criteria for a query, keyed by filter id. The academic
 * year defaults to the current one, as the filter panel's does.
 */
function toFilterCriteria(
  catalog: Catalog,
  filters: CourseFilters,
): Map<string, unknown> {
  const criteria = new Map<string, unknown>();
  const set = <T>(id: string, value: T) => criteria.set(id, value);

  if (filters.searchText)
    set<SearchTextFilterCriteria>('searchText', filters.searchText);
  if (filters.department)
    set<DepartmentFilterCriteria>('department', filters.department);
  if (filters.term) set<TermFilterCriteria>('term', filters.term);
  set<AcademicYearFilterCriteria>(
    'academicYear',
    filters.academicYear ?? { year: currentAcademicYear(catalog) },
  );
  if (filters.availability)
    set<AvailabilityFilterCriteria>('availability', filters.availability);
  if (filters.creditRange)
    set<CreditRangeFilterCriteria>('creditRange', filters.creditRange);
  if (filters.graduateLevel)
    set<GraduateLevelFilterCriteria>('graduateLevel', filters.graduateLevel);
  if (filters.times)
    set<TimesFilterCriteria>('times', {
      ...filters.times,
      windows: canonicalWindows(filters.times.windows),
    });
  if (filters.rmpRating)
    set<RMPRatingFilterCriteria>('rmpRating', filters.rmpRating);
  if (filters.periodConflict)
    set<ConflictCriteria>('periodConflict', {
      avoidConflicts: true,
      blockedSlots: blockedSlotsForCrns(catalog, filters.periodConflict.crns),
      semesterSpansQuarters: filters.periodConflict.semesterSpansQuarters,
    });

  return criteria;
}

/** A FilterService with the filter panel's filters, as AppBootstrap wires it. */
function createFilterService(catalog: Catalog): FilterService {
  const service = new FilterService();
  for (const filter of createDefaultFilters(catalog.rmp)) {
    service.registerFilter(filter);
  }
  service.registerFilter(new SearchTextFilter());
  service.setConflictDetector();
  return service;
}

/** The query's matches in course-list order, before paging. */
function filterCatalog(catalog: Catalog, filters: CourseFilters): Course[] {
  // FilterService holds its filters as state, so each query gets its own.
  const service = createFilterService(catalog);
  for (const [id, criteria] of toFilterCriteria(catalog, filters)) {
    if (!service.addFilter(id, criteria)) {
      throw new Error(`Filter '${id}' rejected its criteria`);
    }
  }

  const matches = service.filterCourses(catalog.courses);

  // As CourseList: a search keeps its relevance ranking, anything else
  // reads by department, then course number.
  if (service.hasFilter('searchText')) return matches;
  return [...matches].sort(
    (a, b) =>
      a.departmentAbbr.localeCompare(b.departmentAbbr) ||
      a.number.localeCompare(b.number),
  );
}

export function runCourseQuery(
  catalog: Catalog,
  query: CourseQuery,
): CourseQueryResult {
  const matches = filterCatalog(catalog, query.filters);
  return {
    total: matches.length,
    offset: query.offset,
    limit: query.limit,
    courses: matches
      .slice(query.offset, query.offset + query.limit)
      .map(toCourseSummary),
  };
}
