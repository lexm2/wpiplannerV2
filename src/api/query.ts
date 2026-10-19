/**
 * A course search, as the HTTP API and the MCP server accept it, run through
 * the web app's own FilterService. `filters` is keyed by filter id with the
 * criteria shapes of src/types/filters.ts, so a filter panel's active filters
 * map onto it one to one. The departures, all resolved here into those
 * shapes: periodConflict takes the CRNs a student already has; department
 * and degreeAttribute accept loose names; times takes earliestStart/latestEnd
 * as shorthand for its windows.
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
  InterestListFilterCriteria,
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
import { getAllSections } from '../utils/courseUtils';
import {
  acronymExpansions,
  describeMatch,
  parseSearchQuery,
  type SearchMatch,
} from '../utils/searchUtils';
import { TERM_ORDER } from '../utils/typeGuards';
import { currentAcademicYear, type Catalog } from './catalog';
import {
  endedTerms,
  seatDataAge,
  termDates,
  yearLabel,
  type TermLetter,
} from './calendar';
import { blockedSlotsForCrns } from './conflicts';
import { companionDrops, dropNotice, judgesCompanions } from './companionDrops';
import { suggestInstructors } from './instructors';
import { knownTermNotes } from './knownTerms';
import { ApiError } from './errors';
import { ClockSchema, clockMinutes, clockText } from './clock';
import { strictObject } from './schemaHints';
import {
  DELIVERY_MODES,
  resolveDegreeAttributes,
  resolveDepartments,
  unpublishedYearError,
} from './lookup';
import {
  courseCode,
  instructorFor,
  primarySections,
  ratingOrder,
  seatTotals,
  termsOf,
  toCourseSummary,
  toSectionBrief,
  type CourseSummary,
  type SectionBrief,
} from './serialize';

const DEFAULT_LIMIT = 25;
/**
 * The default page when a search of several words matches only course
 * descriptions ("alternate years": 79 rows of noise); the closest few say
 * as much as the rest.
 */
const LOOSE_LIMIT = 5;
const SORTS = [
  'relevance',
  'rating',
  'difficulty',
  'openSeats',
  'number',
] as const;
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

const TimeWindowSchema = strictObject({
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

const RMP_BOUNDS = [
  'minRating',
  'maxRating',
  'minDifficulty',
  'maxDifficulty',
  'minWouldTakeAgain',
  'maxWouldTakeAgain',
  'minNumRatings',
] as const;

const FiltersSchema = strictObject(
  {
    searchText: strictObject(
      {
        query: z
          .string()
          .trim()
          .min(1)
          .describe(
            'A course code ("MA 1022", "CS2102"; "CS 21" for every CS 21xx) finds that course first, then courses whose description names it (marked "mentions"); words after a code narrow it ("MA 1022 calculus"). ' +
              'A department name or abbreviation alone ("computer science", "CS") lists its courses by number. ' +
              'Otherwise words, ALL of which must match somewhere: code, name, description, department, degree attributes, instructor or room. ' +
              'Words of 3 letters or fewer match whole words only, and acronyms the catalog spells out ("AI" finds Artificial Intelligence); I-IV equal 1-4; words of 5+ letters tolerate a typo. ' +
              'Name matches rank above description matches, and the response says when no course is mainly about the words. Use one or two topic words ("robotics", "game design"), not sentences.',
          ),
        professorOnly: z
          .boolean()
          .optional()
          .describe('Match the words against instructor names only.'),
      },
      querySchema,
    ).optional(),
    department: strictObject(
      {
        departments: z
          .array(z.string().min(1))
          .min(1)
          .describe(
            'Abbreviations ("CS", "MA") or full names ("Computer Science"), any case.',
          ),
      },
      querySchema,
    ).optional(),
    term: strictObject({ terms: z.array(TermSchema).min(1) }, querySchema)
      .optional()
      .describe(
        'Keep sections in any of these terms. For everything running during A term, ask for ["A", "F"]. Naming a term that has ended keeps its sections.',
      ),
    academicYear: strictObject(
      { year: z.union([YearSchema, z.literal('all')]) },
      querySchema,
    )
      .optional()
      .describe(
        'Defaults to the current academic year, the only one students can schedule. A year whose schedule is not published yet is refused with a pointer to planning instead. "all" searches every year.',
      ),
    availability: strictObject(
      {
        availableOnly: z
          .boolean()
          .default(false)
          .describe(
            'Keep only sections with an open seat; labs and discussions too, so a lecture whose labs are all full is dropped.',
          ),
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
      },
      querySchema,
    ).optional(),
    creditRange: strictObject(
      {
        min: z.number().min(0),
        max: z.number().min(0),
      },
      querySchema,
    )
      .refine(c => c.max >= c.min, 'max must be at least min')
      .optional()
      .describe(
        'Keep courses whose credit range overlaps [min, max]. A standard WPI course is 1/3 unit = 3 credits.',
      ),
    graduateLevel: strictObject(
      { level: z.enum(['all', 'undergraduate', 'graduate']) },
      querySchema,
    ).optional(),
    courseLevel: strictObject(
      {
        min: z.number().int().min(1).max(9).optional(),
        max: z.number().int().min(1).max(9).optional(),
      },
      querySchema,
    )
      .refine(
        c => c.min === undefined || c.max === undefined || c.max >= c.min,
        'max must be at least min',
      )
      .optional()
      .describe(
        'Bounds on the first digit of the course number: 1 = 1000-level (MA 1022), 4 = 4000-level; 1-4 undergraduate, 5+ graduate (DS 502 and CS 5007 are both 5). {min: 3, max: 4} for upper-level undergraduate.',
      ),
    degreeAttribute: strictObject(
      {
        attributes: z
          .array(z.string().min(1))
          .min(1)
          .describe(
            'Degree requirements a course counts toward, any of them: "Humanities and Arts", "Social Sciences", "Capstone Design Experience"... (get_catalog_info lists all, with counts). Case-insensitive; a unique start like "social science" works.',
          ),
      },
      querySchema,
    ).optional(),
    deliveryMode: strictObject(
      { modes: z.array(z.enum(DELIVERY_MODES)).min(1) },
      querySchema,
    )
      .optional()
      .describe(
        'Keep sections taught In-Person, Online or Hybrid. Asynchronous is different: it describes a meeting with no set time and shows as "Async"; an Online section may still meet live.',
      ),
    offeringPattern: strictObject(
      {
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
      },
      querySchema,
    )
      .optional()
      .describe(
        'The only signal of what a later year will offer: Cat. I courses are likely to run again next year.',
      ),
    times: strictObject(
      {
        mode: z
          .enum(['only', 'avoid'])
          .default('only')
          .describe(
            'Default "only": every meeting of a section must fall inside the times. "avoid": drop sections with any meeting overlapping them. ' +
              'Labs and discussions are judged too: a lecture whose labs (or discussions) all fail is dropped, and the response says so.',
          ),
        earliestStart: ClockSchema.optional().describe(
          'Shorthand, on `days` (default every day). "only": meetings start at or after this ("17:00" for evening classes). "avoid": the start of the band to avoid.',
        ),
        latestEnd: ClockSchema.optional().describe(
          'Shorthand, on `days` (default every day). "only": meetings end by this ("12:00"). "avoid": the end of the band to avoid.',
        ),
        days: z
          .array(z.enum(DayOfWeek))
          .min(1)
          .optional()
          .describe(
            'The days the earliestStart/latestEnd band applies to; default every day, so avoid 13:00-17:00 without days clears every weekday. ' +
              'To avoid a Tue/Thu shift only: {mode: "avoid", days: ["T", "R"], earliestStart: "13:00", latestEnd: "17:00"}. ' +
              'To keep all of Friday free: {mode: "avoid", days: ["F"]}. With "only", a day not listed has no allowed time, so sections meeting on it are dropped.',
          ),
        windows: z
          .array(TimeWindowSchema)
          .min(
            1,
            'give at least one window; to bound start and end times on every day, use earliestStart/latestEnd instead',
          )
          .refine(
            ws => ws.every(w => w.startMin < w.endMin),
            'each window must end after it starts',
          )
          .optional()
          .describe(
            'Weekly time windows, one per day and band, each weekday its own entry. With the shorthand too, both apply (their union).',
          ),
        includeAsync: z
          .boolean()
          .optional()
          .describe(
            'Also keep sections with no scheduled meetings (async, TBD): "evening or online" is earliestStart "17:00" with includeAsync true. Default false.',
          ),
      },
      querySchema,
    )
      .refine(
        t => !!(t.windows || t.earliestStart || t.latestEnd || t.days),
        'give windows, or earliestStart/latestEnd (and optionally days)',
      )
      .optional()
      .describe(
        'When sections, their labs and their discussions meet: the earliestStart/latestEnd band on `days` (default every day), windows for particular bands, or both. The response echoes the times as read.',
      ),
    rmpRating: strictObject(
      {
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
            'Ignore averages resting on fewer ratings (treated as no data). Pair it with minRating: a 5.0 from one review passes minRating 4 on its own; minNumRatings 5 keeps averages that mean something.',
          ),
        includeWithoutData: z
          .boolean()
          .optional()
          .describe(
            'Keep lectures whose instructors have no Rate My Professor data. DEFAULT: false when any bound above is given (so minRating 4 means rated 4+), true otherwise.',
          ),
      },
      querySchema,
    )
      .optional()
      .describe(
        "Rate My Professor bounds on 0-5 scales (difficulty: 5 is hardest), judged on the lecture's instructors; a lecture passes when any of them does. Averages on few ratings are noisy: add minNumRatings.",
      ),
    periodConflict: strictObject(
      {
        crns: z
          .array(z.number().int().positive())
          .min(1)
          .describe(
            "CRNs of sections the student already has; sections that clash with any of them are dropped, labs and discussions included. A semester section clashes with both of its quarters' sections.",
          ),
        semesterSpansQuarters: z
          .boolean()
          .optional()
          .describe(
            'Default true: an F section conflicts with A and B, S with C and D. False compares terms exactly.',
          ),
      },
      querySchema,
    ).optional(),
  },
  querySchema,
);

export const CourseQuerySchema = strictObject(
  {
    filters: FiltersSchema.default({}).describe(
      'Filters by id; every one given must match. Omit a filter to not restrict on it.',
    ),
    includeEndedTerms: z
      .boolean()
      .default(false)
      .describe(
        'Default false: in the current year, sections of terms that have already ended are left out (the response says which). Terms named in filters.term are always kept.',
      ),
    includeInterestLists: z
      .boolean()
      .default(false)
      .describe(
        'Default false: interest-list placeholders (no times; joined before real sections open) are left out before any filter is applied.',
      ),
    includeSections: z
      .boolean()
      .optional()
      .describe(
        'List the matching lecture sections under each course (CRN, term, times, instructor, seats). Default: on when any filter beyond searchText, department and academicYear is given.',
      ),
    sort: z
      .enum(SORTS)
      .default('relevance')
      .describe(
        'Default "relevance": by relevance with searchText, else by department and number. ' +
          '"rating": best-rated lecture instructor first, those with 5+ ratings above those with fewer (as "top"), unrated last. ' +
          '"difficulty": easiest-rated instructor first, by the same rule. "openSeats": most open seats in the matching sections first. ' +
          '"number": department, then course number. Ties keep the relevance order.',
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
      .optional()
      .describe(
        `Page size, 1-${MAX_LIMIT}; default ${DEFAULT_LIMIT}, or ${LOOSE_LIMIT} when a search of several words matches no course name, only descriptions.`,
      ),
  },
  querySchema,
);

export type CourseQuery = z.infer<typeof CourseQuerySchema>;

/** For unknown-key errors: where each key does belong. */
function querySchema(): unknown {
  return CourseQuerySchema;
}

/** A lab or discussion under a search row, and the row's lectures it goes with. */
type CompanionBrief = SectionBrief & { pairsWith: number[] };

export interface CourseRow extends CourseSummary {
  /** The matching lecture (or standalone lab) sections, with includeSections. */
  sections?: SectionBrief[];
  /** With sections: the labs and discussions that passed every filter. */
  companions?: CompanionBrief[];
  /** With searchText: how the course matched it (see SearchMatch). */
  match?: SearchMatch;
}

export interface CourseQueryResult {
  /** The year searched. */
  year: number | 'all';
  /** Matching courses across all pages, cross-listings counted once. */
  total: number;
  offset: number;
  limit: number;
  courses: CourseRow[];
  /**
   * Over every matching course on every page: open seats and sections
   * (lectures, or standalone labs for lab-only courses), each CRN once, so a
   * cross-listed class counts once.
   */
  totals: SearchTotals;
  /** Terms whose sections were left out for having ended. */
  excludedEndedTerms: string[];
  /** When the seat counts were read from WPI. */
  dataAsOf: string | null;
  /** Whole days since then (see seatDataAge). */
  dataAgeDays: number | null;
  /** Things the caller should know about how the query was read. */
  notices: string[];
  /**
   * With searchText: the query, and whether every match only mentions it:
   * none has it in its name, code or department, its words together in a
   * description, or an instructor or room matching it; and whether a
   * query of several words matched only descriptions, no course name, code
   * or section (the page then defaults to LOOSE_LIMIT rows).
   */
  search: {
    query: string;
    onlyMentions: boolean;
    descriptionOnly: boolean;
  } | null;
  /**
   * When nothing matched: for each filter given (up to MAX_RELAXED), how
   * many courses match without it, and in which terms, most first.
   */
  relaxations: Relaxation[];
}

interface TermTotals {
  /** Open seats in the capped sections. */
  openSeats: number;
  /** Sections with a seat cap. */
  sections: number;
  /** Sections without one (team and ensemble placeholders), not counted. */
  uncapped: number;
}

interface SearchTotals extends TermTotals {
  courses: number;
  /** The same per term, A-D then F/S. */
  byTerm: (TermTotals & { term: string })[];
}

interface Relaxation {
  /** The filter left out, as keyed in `filters`. */
  filter: string;
  total: number;
  /** Terms the courses found without it run in. */
  terms: string[];
  /**
   * With a searchText naming a course by code: the codes it names that
   * leaving this filter out brings back (["ES 3002"]); else empty.
   */
  restores: string[];
}

/** How many filters an empty search tries leaving out, one at a time. */
const MAX_RELAXED = 6;

/**
 * The same search with each given filter left out in turn, so an empty
 * result can say which filter emptied it. The year stays: it is a choice
 * of what can be scheduled, not a narrowing. Bounded at MAX_RELAXED reruns.
 *
 * Ordered by blame, most to blame first. The text search says what the
 * student is looking for, and the other filters narrow it, so a filter
 * that brings back the course a code names comes first (ES 3002 with
 * avoid W 10-11: times), the one bringing back least besides it ahead,
 * and the search itself comes after every other filter that finds
 * anything; the rest by how many courses come back.
 */
function relax(catalog: Catalog, query: CourseQuery): Relaxation[] {
  const ids = (Object.keys(query.filters) as (keyof CourseQuery['filters'])[])
    .filter(id => id !== 'academicYear' && query.filters[id] !== undefined)
    .slice(0, MAX_RELAXED);
  // A lone search, left out, finds the whole year: nothing worth saying.
  if (ids.length === 1 && ids[0] === 'searchText') return [];
  const text = query.filters.searchText;
  const namesCourse =
    !!text && !text.professorOnly && !!parseSearchQuery(text.query).code?.dept;
  const rank = (r: Relaxation) =>
    r.restores.length ? 0 : r.filter === 'searchText' ? 2 : 1;
  return ids
    .map(filter => {
      const filters = { ...query.filters };
      delete filters[filter];
      const found = collapseCrossListings(
        filterCatalog(
          catalog,
          readQuery(catalog, { ...query, filters }).criteria,
        ),
      );
      const restores =
        namesCourse && filter !== 'searchText'
          ? found
              .filter(c => describeMatch(c, text.query) === 'code')
              .map(courseCode)
          : [];
      return {
        filter,
        total: found.length,
        terms: termsOf(found.flatMap(primarySections)),
        restores,
      };
    })
    .sort((a, b) => {
      const helps = (r: Relaxation) => (r.total > 0 ? 0 : 1);
      // Among filters that bring the named course back, the smallest
      // change: the one that brings back least besides.
      const order = rank(a) === 0 ? a.total - b.total : b.total - a.total;
      return helps(a) - helps(b) || rank(a) - rank(b) || order;
    });
}

const EVERY_DAY = Object.values(DayOfWeek);

type TimesInput = NonNullable<CourseQuery['filters']['times']>;

/**
 * The times filter's windows: those given, and the shorthand's band on
 * each of its days (every day by default).
 */
function timeWindows(times: TimesInput): TimeWindow[] {
  const windows = [...(times.windows ?? [])];
  if (times.earliestStart || times.latestEnd || times.days) {
    const startMin = times.earliestStart
      ? clockMinutes(times.earliestStart)
      : 0;
    const endMin = times.latestEnd ? clockMinutes(times.latestEnd) : 1440;
    if (endMin <= startMin) {
      throw new ApiError('latestEnd must be after earliestStart.');
    }
    for (const day of times.days ?? EVERY_DAY) {
      windows.push({ day, startMin, endMin });
    }
  }
  return canonicalWindows(windows);
}

/** "Avoiding T,R 13:00-17:00", the windows as the filter reads them. */
function describeTimes(times: TimesFilterCriteria): string {
  const bands = new Map<string, DayOfWeek[]>();
  for (const w of times.windows) {
    const band = `${clockText(w.startMin)}-${clockText(w.endMin)}`;
    bands.set(band, [...(bands.get(band) ?? []), w.day]);
  }
  const text = [...bands]
    .map(([band, days]) => {
      const which =
        days.length === EVERY_DAY.length ? 'every day' : days.join(',');
      return band === '00:00-24:00' ? `all of ${which}` : `${which} ${band}`;
    })
    .join('; ');
  const async = times.includeAsync ? ', sections with no set time kept' : '';
  return times.mode === 'avoid'
    ? `Times read as: avoiding ${text}${async}.`
    : `Times read as: only within ${text}${async}.`;
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
  // Before every other filter, so a placeholder (listed as Online, with a
  // waitlist) can neither match nor be counted.
  set<InterestListFilterCriteria>('interestList', {
    includeInterestLists: query.includeInterestLists,
  });

  if (filters.searchText)
    set<SearchTextFilterCriteria>('searchText', filters.searchText);
  if (filters.department) {
    const { abbrs, notes } = resolveDepartments(
      catalog,
      filters.department.departments,
    );
    set<DepartmentFilterCriteria>('department', { departments: abbrs });
    notices.push(...notes);
  }

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
  } else if (ended.length) {
    notices.push(
      ended.length === 1
        ? `Term ${ended[0]} has ended: its sections are listed but can no longer be taken.`
        : `Terms ${ended.join(', ')} have ended: their sections are listed but can no longer be taken.`,
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

  if (filters.times) {
    const times: TimesFilterCriteria = {
      mode: filters.times.mode,
      windows: timeWindows(filters.times),
      includeAsync: filters.times.includeAsync,
    };
    set<TimesFilterCriteria>('times', times);
    notices.push(describeTimes(times));
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

function filterServiceFor(
  catalog: Catalog,
  criteria: Map<string, unknown>,
): FilterService {
  // FilterService holds its filters as state, so each query gets its own.
  const service = createFilterService(catalog);
  for (const [id, value] of criteria) {
    if (!service.addFilter(id, value)) {
      throw new Error(`Filter '${id}' rejected its criteria`);
    }
  }
  return service;
}

/** The query's matches in course-list order, before paging. */
function filterCatalog(
  catalog: Catalog,
  criteria: Map<string, unknown>,
): Course[] {
  const service = filterServiceFor(catalog, criteria);
  const matches = service.filterCourses(catalog.courses);

  // As CourseList: a search keeps its relevance ranking, anything else
  // reads by department, then course number.
  if (service.hasFilter('searchText')) return matches;
  return [...matches].sort(byNumber);
}

function termTotals(sections: Section[]): TermTotals {
  const seats = seatTotals(sections);
  return {
    openSeats: seats.available,
    sections: sections.length - seats.uncapped,
    uncapped: seats.uncapped,
  };
}

function totalsOf(courses: Course[]): SearchTotals {
  const byCrn = new Map<number, Section>();
  for (const course of courses) {
    for (const s of primarySections(course)) byCrn.set(s.crn, s);
  }
  const sections = [...byCrn.values()];
  return {
    ...termTotals(sections),
    courses: courses.length,
    byTerm: termsOf(sections).map(term => ({
      term,
      ...termTotals(sections.filter(s => (s.computedTerm as string) === term)),
    })),
  };
}

const byNumber = (a: Course, b: Course) =>
  a.departmentAbbr.localeCompare(b.departmentAbbr) ||
  a.number.localeCompare(b.number);

// A query asking to register, rather than for a topic.
const REGISTRATION_RE =
  /\b(register|registering|registration|enroll|enrol|enrolling|enrollment|sign(ing)? ?up)\b/i;

const REGISTRATION_NOTE =
  'Registration is in WPI Workday, with the CRNs listed here; this catalog is read-only and cannot register anyone.';

/**
 * "Hybrid: none in 2026-27 matching the other filters." for each delivery
 * mode asked for alongside others that no matching section has.
 */
function missingModes(
  query: CourseQuery,
  matches: Course[],
  year: number | 'all',
): string[] {
  const modes = query.filters.deliveryMode?.modes ?? [];
  if (modes.length < 2 || matches.length === 0) return [];
  const found = new Set(
    matches.flatMap(c =>
      getAllSections(c).map(s => s.deliveryMode.toLowerCase()),
    ),
  );
  const where = year === 'all' ? 'any year' : yearLabel(year);
  return modes
    .filter(m => !found.has(m.toLowerCase()))
    .map(m => `${m}: none in ${where} matching the other filters.`);
}

/** "Did you mean Gillian Smith?" for a search that found nothing. */
function instructorNotice(inYear: Course[], query: string): string[] {
  const names = suggestInstructors(inYear, query);
  if (!names.length) return [];
  return [
    `No instructor is named "${query.trim()}"; did you mean ${names.join(' or ')}? Search their courses with filters.searchText {query: "${names[0]}", professorOnly: true}.`,
  ];
}

/** '"AI" read as AI or artificial intelligence.', for each acronym in the query. */
function acronymNotices(query: string): string[] {
  return parseSearchQuery(query).words.flatMap(word => {
    const expansions = acronymExpansions(word);
    if (!expansions.length) return [];
    return [
      `"${word.toUpperCase()}" read as ${word.toUpperCase()} or ${expansions.join(' or ')}.`,
    ];
  });
}

const SORT_NOTICE: Record<Exclude<CourseQuery['sort'], 'relevance'>, string> = {
  rating:
    'Sorted by the best-rated lecture instructor; averages on 5+ ratings rank above those on fewer, unrated last.',
  difficulty:
    'Sorted by the easiest-rated lecture instructor; averages on 5+ ratings rank above those on fewer, unrated last.',
  openSeats: 'Sorted by open seats in the matching sections, most first.',
  number: 'Sorted by department, then course number.',
};

/**
 * The matches in the order asked for; a stable sort, so ties keep the
 * relevance (or department and number) order.
 */
function sortCourses(
  courses: Course[],
  sort: CourseQuery['sort'],
  catalog: Catalog,
): Course[] {
  if (sort === 'relevance') return courses;
  if (sort === 'number') return [...courses].sort(byNumber);
  if (sort === 'openSeats') {
    const open = new Map(
      courses.map(c => [c, seatTotals(primarySections(c)).available]),
    );
    return [...courses].sort((a, b) => open.get(b)! - open.get(a)!);
  }
  const best = new Map(
    courses.map(c => [c, instructorFor(c, catalog.rmp, sort)]),
  );
  return [...courses].sort((a, b) => {
    const ra = best.get(a);
    const rb = best.get(b);
    if (!ra || !rb) return (ra ? 0 : 1) - (rb ? 0 : 1);
    return ratingOrder(ra, rb, sort);
  });
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
  return lectures.map(({ s, kind }) => toSectionBrief(s, kind, catalog.rmp));
}

/**
 * The labs and discussions that passed every filter, each once, with the
 * matching lectures it goes with: the row's course is the filtered one, so
 * its lecture groups hold only those.
 */
function rowCompanions(course: Course, catalog: Catalog): CompanionBrief[] {
  const byCrn = new Map<number, CompanionBrief>();
  for (const group of course.lectures ?? []) {
    const companions = [
      ...group.compatibleDiscussions.map(s => ({
        s,
        kind: 'discussion' as const,
      })),
      ...group.compatibleLabs.map(s => ({ s, kind: 'lab' as const })),
    ];
    for (const { s, kind } of companions) {
      let brief = byCrn.get(s.crn);
      if (!brief) {
        brief = { ...toSectionBrief(s, kind, catalog.rmp), pairsWith: [] };
        byCrn.set(s.crn, brief);
      }
      brief.pairsWith.push(group.section.crn);
    }
  }
  return [...byCrn.values()];
}

/** Notices for courses lost through their labs and discussions alone. */
function companionNotices(
  catalog: Catalog,
  criteria: Map<string, unknown>,
  matches: Course[],
): string[] {
  if (!judgesCompanions(criteria)) return [];
  const passed = filterServiceFor(catalog, criteria).apply(catalog.courses);
  return companionDrops(passed, matches, criteria).map(dropNotice);
}

export function runCourseQuery(
  catalog: Catalog,
  query: CourseQuery,
): CourseQueryResult {
  const read = readQuery(catalog, query);
  const filtered = filterCatalog(catalog, read.criteria);
  const matches = sortCourses(
    collapseCrossListings(filtered),
    query.sort,
    catalog,
  );

  const includeSections =
    query.includeSections ??
    (Object.keys(query.filters).some(id => !SECTION_LIST_FILTERS.has(id)) ||
      !!query.filters.searchText?.professorOnly);

  // How each course matched a text search; instructor-only searches are
  // about people, not topics.
  const text = query.filters.searchText;
  const matchOf = new Map<Course, SearchMatch>();
  if (text && !text.professorOnly) {
    for (const c of matches) matchOf.set(c, describeMatch(c, text.query));
  }
  const every = (kinds: SearchMatch[]) =>
    matchOf.size > 0 && [...matchOf.values()].every(m => kinds.includes(m));
  const search = text
    ? {
        query: text.query,
        onlyMentions: every(['mentions', 'scattered']),
        descriptionOnly:
          parseSearchQuery(text.query).words.length >= 2 &&
          every(['description', 'scattered']),
      }
    : null;
  const limit =
    query.limit ?? (search?.descriptionOnly ? LOOSE_LIMIT : DEFAULT_LIMIT);

  const inYear = catalog.courses.filter(
    c => read.year === 'all' || c.academicYear === read.year,
  );
  const notices = [
    ...(text && !text.professorOnly ? knownTermNotes(text.query, inYear) : []),
    ...read.notices,
    ...companionNotices(catalog, read.criteria, filtered),
  ];
  const relaxations = matches.length === 0 ? relax(catalog, query) : [];
  if (matches.length === 0 && text) {
    notices.push(...instructorNotice(inYear, text.query));
  }
  if (matches.length > 0 && query.offset >= matches.length) {
    notices.push(
      `Offset ${query.offset} is past the end: there are only ${matches.length} matching courses.`,
    );
  }
  if (text && !text.professorOnly) notices.push(...acronymNotices(text.query));
  if (query.sort !== 'relevance') notices.push(SORT_NOTICE[query.sort]);
  notices.push(...missingModes(query, matches, read.year));
  if (text && REGISTRATION_RE.test(text.query)) notices.push(REGISTRATION_NOTE);
  if (search?.descriptionOnly && query.limit === undefined) {
    if (matches.length > LOOSE_LIMIT) {
      notices.push(
        `No course name has these words, only descriptions: listing the closest ${LOOSE_LIMIT} of ${matches.length}. Pass limit for more, or search one or two topic words.`,
      );
    }
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
    limit,
    courses: matches.slice(query.offset, query.offset + limit).map(c => {
      const row: CourseRow = toCourseSummary(c, catalog.rmp);
      if (includeSections) {
        row.sections = rowSections(c, catalog);
        const companions = rowCompanions(c, catalog);
        if (companions.length) row.companions = companions;
      }
      const match = matchOf.get(c);
      if (match) row.match = match;
      return row;
    }),
    search,
    relaxations,
    totals: totalsOf(matches),
    excludedEndedTerms: read.excludedEndedTerms,
    dataAsOf: catalog.lastUpdated,
    dataAgeDays: seatDataAge(catalog),
    notices,
  };
}
