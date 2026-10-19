/**
 * A course search, as the HTTP API and the MCP server accept it, run through
 * the web app's own FilterService. `filters` is keyed by filter id with the
 * criteria shapes of src/types/filters.ts, so a filter panel's active filters
 * map onto it one to one. The departures, all resolved here into those
 * shapes: periodConflict takes the CRNs a student already has; department
 * and degreeAttribute accept loose names; earliestStart/latestEnd expand
 * into times windows.
 */
import * as z from 'zod';
import type { Course, Section } from '../types/types';
import { DayOfWeek } from '../types/types';
import { AcademicTerm } from '../types/schedule';
import type {
  AcademicYearFilterCriteria,
  AvailabilityFilterCriteria,
  ConflictCriteria,
  CourseLevelFilterCriteria,
  CreditRangeFilterCriteria,
  DegreeAttributeFilterCriteria,
  DeliveryModeFilterCriteria,
  DepartmentFilterCriteria,
  GraduateLevelFilterCriteria,
  OfferingPatternFilterCriteria,
  RMPRatingFilterCriteria,
  SearchTextFilterCriteria,
  TermFilterCriteria,
  TimesFilterCriteria,
  TimeWindow,
} from '../types/filters';
import { FilterService } from '../services/filtering/FilterService';
import {
  createDefaultFilters,
  SearchTextFilter,
} from '../core/filtering/filters';
import { canonicalWindows } from '../utils/timeWindows';
import { TERM_ORDER } from '../utils/typeGuards';
import { currentAcademicYear, type Catalog } from './catalog';
import { endedTerms, termDates, yearLabel, type TermLetter } from './calendar';
import { blockedSlotsForCrns } from './conflicts';
import { ApiError } from './errors';
import {
  DELIVERY_MODES,
  resolveDegreeAttributes,
  resolveDepartments,
  unpublishedYearError,
} from './lookup';
import {
  courseCode,
  primarySections,
  toCourseSummary,
  toSectionBrief,
  type CourseSummary,
  type SectionBrief,
} from './serialize';

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

const ClockSchema = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'use 24-hour HH:MM, e.g. "09:30"');

const RMP_BOUNDS = [
  'minRating',
  'maxRating',
  'minDifficulty',
  'maxDifficulty',
  'minWouldTakeAgain',
  'maxWouldTakeAgain',
  'minNumRatings',
] as const;

const FiltersSchema = z
  .object({
    searchText: z
      .object({
        query: z
          .string()
          .trim()
          .min(1)
          .describe(
            'A course code ("MA 1022", "CS2102"; "CS 21" for every CS 21xx) finds that course first, then courses whose description names it. ' +
              'Otherwise words, ALL of which must match somewhere: code, name, description, department, degree attributes, instructor or room. ' +
              'Words of 5+ letters tolerate a typo. Name matches rank above description matches. Use one or two topic words ("robotics", "game design"), not sentences.',
          ),
        professorOnly: z
          .boolean()
          .optional()
          .describe('Match the words against instructor names only.'),
      })
      .strict()
      .optional(),
    department: z
      .object({
        departments: z
          .array(z.string().min(1))
          .min(1)
          .describe(
            'Abbreviations ("CS", "MA") or full names ("Computer Science"), any case.',
          ),
      })
      .strict()
      .optional(),
    term: z
      .object({ terms: z.array(TermSchema).min(1) })
      .strict()
      .optional()
      .describe(
        'Keep sections in any of these terms. For everything running during A term, ask for ["A", "F"]. Naming a term that has ended keeps its sections.',
      ),
    academicYear: z
      .object({ year: z.union([YearSchema, z.literal('all')]) })
      .strict()
      .optional()
      .describe(
        'Defaults to the current academic year, the only one students can schedule. A year whose schedule is not published yet is refused with a pointer to planning instead. "all" searches every year.',
      ),
    availability: z
      .object({
        availableOnly: z
          .boolean()
          .default(false)
          .describe('Keep only sections with an open seat.'),
        minAvailable: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Keep only sections with at least this many open seats.'),
        maxWaitlisted: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            'Keep only sections with at most this many students waitlisted; 0 for no waitlist.',
          ),
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
        'Keep courses whose credit range overlaps [min, max]. A standard WPI course is 1/3 unit = 3 credits.',
      ),
    graduateLevel: z
      .object({ level: z.enum(['all', 'undergraduate', 'graduate']) })
      .strict()
      .optional(),
    courseLevel: z
      .object({
        min: z.number().int().min(1).max(9).optional(),
        max: z.number().int().min(1).max(9).optional(),
      })
      .strict()
      .refine(
        c => c.min === undefined || c.max === undefined || c.max >= c.min,
        'max must be at least min',
      )
      .optional()
      .describe(
        'Bounds on the first digit of the course number: 1 = 1000-level (MA 1022), 4 = 4000-level; 1-4 undergraduate, 5+ graduate (DS 502 and CS 5007 are both 5). {min: 3, max: 4} for upper-level undergraduate.',
      ),
    degreeAttribute: z
      .object({
        attributes: z
          .array(z.string().min(1))
          .min(1)
          .describe(
            'Degree requirements a course counts toward, any of them: "Humanities and Arts", "Social Sciences", "Capstone Design Experience"... (get_catalog_info lists all, with counts). Case-insensitive; a unique start like "social science" works.',
          ),
      })
      .strict()
      .optional(),
    deliveryMode: z
      .object({ modes: z.array(z.enum(DELIVERY_MODES)).min(1) })
      .strict()
      .optional()
      .describe(
        'Keep sections taught In-Person, Online or Hybrid. Asynchronous is different: it describes a meeting with no set time and shows as "Async"; an Online section may still meet live.',
      ),
    offeringPattern: z
      .object({
        categories: z
          .array(z.union([z.literal(1), z.literal(2), z.literal(3)]))
          .min(1)
          .describe(
            'WPI offering category: 1 = every year, 2 = at least every other year, 3 = occasionally or on demand.',
          ),
        includeUnknown: z
          .boolean()
          .optional()
          .describe(
            'Also keep courses with no category on record (most graduate courses). Default false.',
          ),
      })
      .strict()
      .optional()
      .describe(
        'The only signal of what a later year will offer: Cat. I courses are likely to run again next year.',
      ),
    times: z
      .object({
        mode: z
          .enum(['only', 'avoid'])
          .describe(
            '"only": every meeting of a section must fall inside the windows. "avoid": drop sections with any meeting overlapping a window.',
          ),
        windows: z
          .array(TimeWindowSchema)
          .min(
            1,
            'give at least one window; to restrict start and end times on every day, use earliestStart/latestEnd instead',
          )
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
        minNumRatings: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            'Ignore averages resting on fewer ratings (treated as no data).',
          ),
        includeWithoutData: z
          .boolean()
          .optional()
          .describe(
            'Keep lectures whose instructors have no Rate My Professor data. DEFAULT: false when any bound above is given (so minRating 4 means rated 4+), true otherwise.',
          ),
      })
      .strict()
      .optional()
      .describe(
        "Rate My Professor bounds on 0-5 scales, judged on the lecture's instructors; a lecture passes when any of them does.",
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
    earliestStart: ClockSchema.optional().describe(
      'Shorthand for times: every meeting starts at or after this, any day ("10:00"). Cannot be combined with filters.times.',
    ),
    latestEnd: ClockSchema.optional().describe(
      'Shorthand for times: every meeting ends by this, any day ("17:00").',
    ),
    includeEndedTerms: z
      .boolean()
      .default(false)
      .describe(
        'Default false: in the current year, sections of terms that have already ended are left out (the response says which). Terms named in filters.term are always kept.',
      ),
    includeSections: z
      .boolean()
      .optional()
      .describe(
        'List the matching lecture sections under each course (CRN, term, times, instructor, seats). Default: on when any filter beyond searchText, department and academicYear is given.',
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

export interface CourseRow extends CourseSummary {
  /** The matching lecture (or standalone lab) sections, with includeSections. */
  sections?: SectionBrief[];
}

export interface CourseQueryResult {
  /** The year searched. */
  year: number | 'all';
  /** Matching courses across all pages, cross-listings counted once. */
  total: number;
  offset: number;
  limit: number;
  courses: CourseRow[];
  /** Terms whose sections were left out for having ended. */
  excludedEndedTerms: string[];
  /** When the seat counts were read from WPI. */
  dataAsOf: string | null;
  /** Things the caller should know about how the query was read. */
  notices: string[];
}

const EVERY_DAY = Object.values(DayOfWeek);

const minutes = (clock: string) => {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
};

/** earliestStart/latestEnd as one "only" window per day. */
function clockWindows(query: CourseQuery): TimeWindow[] | null {
  if (!query.earliestStart && !query.latestEnd) return null;
  if (query.filters.times) {
    throw new ApiError(
      'Give either filters.times or earliestStart/latestEnd, not both.',
    );
  }
  const startMin = query.earliestStart ? minutes(query.earliestStart) : 0;
  const endMin = query.latestEnd ? minutes(query.latestEnd) : 1440;
  if (endMin <= startMin) {
    throw new ApiError('latestEnd must be after earliestStart.');
  }
  return EVERY_DAY.map(day => ({ day, startMin, endMin }));
}

interface ReadQuery {
  criteria: Map<string, unknown>;
  year: number | 'all';
  excludedEndedTerms: string[];
  notices: string[];
}

/**
 * The FilterService criteria for a query, keyed by filter id, with loose
 * names resolved and the defaults filled in: the current academic year, as
 * the filter panel's, and no sections of terms that have ended.
 */
function readQuery(catalog: Catalog, query: CourseQuery): ReadQuery {
  const { filters } = query;
  const criteria = new Map<string, unknown>();
  const set = <T>(id: string, value: T) => criteria.set(id, value);
  const notices: string[] = [];
  const current = currentAcademicYear(catalog);

  const year = filters.academicYear?.year ?? current;
  if (year !== 'all') {
    const error = unpublishedYearError(catalog, year);
    if (error) throw error;
  }
  set<AcademicYearFilterCriteria>('academicYear', { year });

  if (filters.searchText)
    set<SearchTextFilterCriteria>('searchText', filters.searchText);
  if (filters.department)
    set<DepartmentFilterCriteria>('department', {
      departments: resolveDepartments(catalog, filters.department.departments),
    });

  // Sections of ended terms can no longer be taken; leave them out unless
  // the caller asked for those terms by name.
  let excludedEndedTerms: string[] = [];
  const ended: string[] = year === current ? endedTerms(catalog, current) : [];
  if (filters.term) {
    set<TermFilterCriteria>('term', filters.term);
    const named = filters.term.terms.filter(t => ended.includes(t));
    if (named.length) {
      const dates = termDates(catalog, current);
      notices.push(
        `${named.map(t => `${t} term ended ${dates?.[t as TermLetter].end ?? ''}`.trim()).join('; ')}: its sections are listed but can no longer be taken.`,
      );
    }
  } else if (ended.length && !query.includeEndedTerms) {
    excludedEndedTerms = ended;
    set<TermFilterCriteria>('term', {
      terms: TERM_ORDER.filter(t => !ended.includes(t)) as AcademicTerm[],
    });
    notices.push(
      `Sections in terms that have ended (${ended.join(', ')}) are left out; pass includeEndedTerms: true to include them.`,
    );
  }

  if (filters.availability)
    set<AvailabilityFilterCriteria>('availability', filters.availability);
  if (filters.creditRange)
    set<CreditRangeFilterCriteria>('creditRange', filters.creditRange);
  if (filters.graduateLevel)
    set<GraduateLevelFilterCriteria>('graduateLevel', filters.graduateLevel);
  if (filters.courseLevel)
    set<CourseLevelFilterCriteria>('courseLevel', filters.courseLevel);
  if (filters.degreeAttribute)
    set<DegreeAttributeFilterCriteria>('degreeAttribute', {
      attributes: resolveDegreeAttributes(
        catalog,
        filters.degreeAttribute.attributes,
      ),
    });
  if (filters.deliveryMode)
    set<DeliveryModeFilterCriteria>('deliveryMode', filters.deliveryMode);
  if (filters.offeringPattern)
    set<OfferingPatternFilterCriteria>(
      'offeringPattern',
      filters.offeringPattern,
    );

  const windows = clockWindows(query);
  if (filters.times || windows) {
    set<TimesFilterCriteria>('times', {
      mode: filters.times?.mode ?? 'only',
      windows: canonicalWindows(windows ?? filters.times!.windows),
      includeAsync: filters.times?.includeAsync,
    });
  }

  if (filters.rmpRating) {
    const bounded = RMP_BOUNDS.some(k => filters.rmpRating![k] !== undefined);
    set<RMPRatingFilterCriteria>('rmpRating', {
      ...filters.rmpRating,
      includeWithoutData: filters.rmpRating.includeWithoutData ?? !bounded,
    });
  }
  if (filters.periodConflict)
    set<ConflictCriteria>('periodConflict', {
      avoidConflicts: true,
      blockedSlots: blockedSlotsForCrns(catalog, filters.periodConflict.crns),
      semesterSpansQuarters: filters.periodConflict.semesterSpansQuarters,
    });

  return { criteria, year, excludedEndedTerms, notices };
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
function filterCatalog(
  catalog: Catalog,
  criteria: Map<string, unknown>,
): Course[] {
  // FilterService holds its filters as state, so each query gets its own.
  const service = createFilterService(catalog);
  for (const [id, value] of criteria) {
    if (!service.addFilter(id, value)) {
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

const crnsOf = (course: Course) =>
  new Set(primarySections(course).map(s => s.crn));

/**
 * One row per class: a cross-listed course whose matching sections all
 * appear under an earlier row (DS 502 and MA 543 share CRNs) is that row,
 * listed under another code, and is dropped. Where only some sections are
 * shared, both rows stay.
 */
function collapseCrossListings(courses: Course[]): Course[] {
  const kept: Course[] = [];
  const byCode = new Map<string, Course>();
  for (const course of courses) {
    const own = crnsOf(course);
    const duplicate = course.crossListedWith.some(code => {
      const prior = byCode.get(code);
      if (!prior || prior.academicYear !== course.academicYear) return false;
      const priorCrns = crnsOf(prior);
      return own.size > 0 && [...own].every(crn => priorCrns.has(crn));
    });
    if (duplicate) continue;
    kept.push(course);
    byCode.set(courseCode(course), course);
  }
  return kept;
}

// Filters that pick courses rather than sections; with only these, rows
// leave their sections out unless asked.
const SECTION_LIST_FILTERS = new Set([
  'searchText',
  'department',
  'academicYear',
]);

function rowSections(course: Course, catalog: Catalog): SectionBrief[] {
  const lectures = course.lectures?.length
    ? course.lectures.map(g => ({ s: g.section, kind: 'lecture' as const }))
    : (course.standaloneLabs ?? []).map((s: Section) => ({
        s,
        kind: 'standaloneLab' as const,
      }));
  return lectures
    .filter(({ s }) => !s.isInterestList)
    .map(({ s, kind }) => toSectionBrief(s, kind, catalog.rmp));
}

export function runCourseQuery(
  catalog: Catalog,
  query: CourseQuery,
): CourseQueryResult {
  const read = readQuery(catalog, query);
  const matches = collapseCrossListings(filterCatalog(catalog, read.criteria));

  const includeSections =
    query.includeSections ??
    (Object.keys(query.filters).some(id => !SECTION_LIST_FILTERS.has(id)) ||
      !!query.filters.searchText?.professorOnly ||
      !!query.earliestStart ||
      !!query.latestEnd);

  const notices = [...read.notices];
  if (matches.length > 0 && query.offset >= matches.length) {
    notices.push(
      `Offset ${query.offset} is past the end: there are only ${matches.length} matching courses.`,
    );
  }
  if (read.year === 'all') {
    notices.push(
      `Searching every year; only ${yearLabel(currentAcademicYear(catalog))} can be scheduled.`,
    );
  }

  return {
    year: read.year,
    total: matches.length,
    offset: query.offset,
    limit: query.limit,
    courses: matches.slice(query.offset, query.offset + query.limit).map(c => {
      const row: CourseRow = toCourseSummary(c, catalog.rmp);
      if (includeSections) row.sections = rowSections(c, catalog);
      return row;
    }),
    excludedEndedTerms: read.excludedEndedTerms,
    dataAsOf: catalog.lastUpdated,
    notices,
  };
}
