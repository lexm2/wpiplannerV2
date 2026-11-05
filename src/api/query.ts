/**
 * A course search, as the HTTP API and the MCP server accept it, run through
 * the web app's own FilterService. `filters` comes from the app's filter
 * registry (src/api/filterInputs.ts): keyed by filter id, each taking its
 * filter's criteria, so a filter panel's active filters map onto it one to
 * one, and a filter added to the registry is searchable here too. Where the
 * API reads a filter more loosely (names, the times shorthand, CRNs), that
 * is resolved in filterInputs.ts into the filter's own criteria.
 */
import * as z from 'zod';
import type { Course, Section } from '../types/types';
import type { FilterableSection } from '../types/filterableUnit';
import type {
  InterestListFilterCriteria,
  SearchTextFilterCriteria,
} from '../types/filters';
import { FilterService } from '../services/filtering/FilterService';
import { createFilters } from '../core/filtering/filters';
import { getAllSections } from '../utils/courseUtils';
import {
  MAX_QUERY_WORDS,
  type ParsedQuery,
  type SearchMatch,
} from '../utils/searchUtils';
import { currentAcademicYear, type Catalog } from './catalog';
import {
  endedTerms,
  isUnpublished,
  seatDataAge,
  termDates,
  yearLabel,
  type TermLetter,
} from './calendar';
import { companionDrops, dropNotice, judgesCompanions } from './companionDrops';
import { suggestInstructors } from './instructors';
import { knownTermNotes } from './knownTerms';
import { echo } from './errors';
import { notice, type Notice } from './notices';
import { one } from './text';
import { ClosedSectionsFilter } from './closedSectionsFilter';
import { EndedTermsFilter } from './endedTermsFilter';
import { strictObject } from './schemaHints';
import {
  filtersSchema,
  picksCoursesOnly,
  readFilters,
  type FilterId,
  type ReadContext,
} from './filterInputs';
import { unpublishedYearError } from './lookup';
import {
  byTerm,
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

/** A strict object whose unknown-key errors point into the whole query. */
const obj = <S extends z.core.$ZodLooseShape>(shape: S) =>
  strictObject(shape, querySchema);

const FiltersSchema = filtersSchema(obj);

export const CourseQuerySchema = obj({
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
});

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
  /**
   * Searching every year: the course is one of an unpublished year's early
   * entries, its term and time tentative and nothing schedulable, so it
   * lists no sections.
   */
  earlyEntry?: true;
}

export interface CourseQueryResult {
  /** The year searched. */
  year: number | 'all';
  /** The order asked for; under "difficulty", topInstructor is the easiest rated. */
  sort: CourseQuery['sort'];
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
  notices: Notice[];
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
   * When nothing matched: for each filter given that can narrow anything,
   * how many courses match without it, and in which terms, most to blame
   * first. Every such filter is tried.
   */
  relaxations: Relaxation[];
  /**
   * When nothing matched: filters given that allow every course as given
   * (the whole credit range, every level or mode), so cannot be to blame
   * and are not tried.
   */
  unrestrictive: string[];
  /**
   * When a code search did not find the course it names: the ones a default
   * left out, because they run only in terms that have ended or are only
   * interest lists so far, with the terms. Empty otherwise.
   */
  leftOut: LeftOut[];
}

interface LeftOut {
  reason: 'endedTerms' | 'interestLists';
  /** The courses the code names that the option would bring back. */
  codes: string[];
  /** Their terms: the ended ones, or those with an interest list. */
  terms: string[];
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
  /**
   * Searching every year: the one year whose sections the seats count (the
   * current one), since another year's B seats are not this B's. Else null.
   */
  seatsYear: number | null;
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

/**
 * Filters given in a form that lets every course through: run alone on the
 * year's sections, they keep every one (the full credit range, every level,
 * mode, term or offering category, an availability or rating filter with
 * no bound). Leaving one out changes nothing, so an empty search never
 * blames or reruns it. Asking the filters themselves, rather than listing
 * what "everything" means for each, keeps this true as they change: a
 * level range of 1-9 drops a course number without digits.
 */
function unrestrictiveFilters(
  catalog: Catalog,
  query: CourseQuery,
  criteria: Map<string, unknown>,
): FilterId[] {
  const always = ['academicYear', 'interestList'] as const;
  const base = always.map(id => [id, criteria.get(id)] as const);
  const kept = (...extra: (readonly [string, unknown])[]) =>
    filterServiceFor(catalog, new Map([...base, ...extra])).apply(
      catalog.courses,
    ).length;
  const all = kept();
  return (Object.keys(query.filters) as FilterId[]).filter(
    id =>
      id !== 'academicYear' &&
      criteria.has(id) &&
      kept([id, criteria.get(id)]) === all,
  );
}

/**
 * The same search with each given filter left out in turn, so an empty
 * result can say which filter emptied it. The year stays: it is a choice
 * of what can be scheduled, not a narrowing. Filters that let everything
 * through are skipped; every other one is tried (one rerun per filter, each
 * a few milliseconds, and only for an empty search).
 *
 * Ordered by blame, most to blame first. The text search says what the
 * student is looking for, and the other filters narrow it, so a filter
 * that brings back the course a code names comes first (ES 3002 with
 * avoid W 10-11: times), the one bringing back least besides it ahead,
 * and the search itself comes after every other filter that finds
 * anything; the rest by how many courses come back.
 */
function relax(
  catalog: Catalog,
  query: CourseQuery,
  skip: FilterId[],
  codeSearch: string | null,
): Relaxation[] {
  const ids = (Object.keys(query.filters) as FilterId[]).filter(
    id =>
      id !== 'academicYear' &&
      query.filters[id] !== undefined &&
      !skip.includes(id),
  );
  // A lone search, left out, finds the whole year: nothing worth saying.
  if (ids.length === 1 && ids[0] === 'searchText') return [];
  const rank = (r: Relaxation) =>
    r.restores.length ? 0 : r.filter === 'searchText' ? 2 : 1;
  return ids
    .map(filter => {
      const filters = { ...query.filters };
      delete filters[filter];
      const found = matchesFor(catalog, { ...query, filters });
      const restores =
        codeSearch !== null && filter !== 'searchText'
          ? found
              .filter(
                c => catalog.search.describeMatch(c, codeSearch) === 'code',
              )
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

/**
 * For a code search that found nothing, the named courses the ended-term
 * and interest-list defaults left out: "BME 4023" ran only in A, which has
 * ended, and "No matching courses" read as no such course. One rerun per
 * default in force.
 */
function leftOutByDefaults(
  catalog: Catalog,
  query: CourseQuery,
  codeSearch: string | null,
): LeftOut[] {
  if (codeSearch === null) return [];
  const options = [
    { reason: 'endedTerms', key: 'includeEndedTerms' },
    { reason: 'interestLists', key: 'includeInterestLists' },
  ] as const;
  return options.flatMap(({ reason, key }) => {
    if (query[key]) return [];
    const found = matchesFor(catalog, { ...query, [key]: true }).filter(
      c => catalog.search.describeMatch(c, codeSearch) === 'code',
    );
    if (!found.length) return [];
    const sections = found.flatMap(c => getAllSections(c));
    return [
      {
        reason,
        codes: found.map(courseCode),
        terms: termsOf(
          reason === 'interestLists'
            ? sections.filter(s => s.isInterestList)
            : sections,
        ),
      },
    ];
  });
}

interface ReadQuery {
  criteria: Map<string, unknown>;
  year: number | 'all';
  excludedEndedTerms: string[];
  notices: Notice[];
}

/**
 * The FilterService criteria for a query, keyed by filter id, with loose
 * names resolved and the defaults filled in: the current academic year, as
 * the filter panel's, and no sections of terms that have ended.
 */
function readQuery(catalog: Catalog, query: CourseQuery): ReadQuery {
  const current = currentAcademicYear(catalog);
  // Read first: the year decides which terms have ended and which CRNs
  // can clash.
  const year = query.filters.academicYear?.year ?? current;
  if (year !== 'all') {
    const error = unpublishedYearError(catalog, year);
    if (error) throw error;
  }
  const ctx: ReadContext = {
    catalog,
    year,
    current,
    ended:
      year === current || year === 'all' ? endedTerms(catalog, current) : [],
    includeEndedTerms: query.includeEndedTerms,
    criteria: new Map(),
    notices: [],
    excludedEndedTerms: [],
  };
  // Before every other filter, so a placeholder (listed as Online, with a
  // waitlist) can neither match nor be counted.
  ctx.criteria.set('interestList', {
    includeInterestLists: query.includeInterestLists,
  } satisfies InterestListFilterCriteria);
  readFilters(query.filters, ctx);
  return {
    criteria: ctx.criteria,
    year,
    excludedEndedTerms: ctx.excludedEndedTerms,
    notices: ctx.notices,
  };
}

/** A FilterService with the filter panel's filters, as AppBootstrap wires it. */
function createFilterService(catalog: Catalog): FilterService {
  const service = new FilterService();
  for (const filter of createFilters({
    rmp: catalog.rmp,
    searchIndex: () => catalog.search,
  })) {
    service.registerFilter(filter);
  }
  service.registerFilter(new EndedTermsFilter());
  service.registerFilter(new ClosedSectionsFilter());
  return service;
}

export function filterServiceFor(
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

/**
 * The query's matches in course-list order, before paging, as
 * FilterService.filterCourses finds them, and the sections that passed
 * every filter, which companionDrops reads.
 */
function filterCatalog(
  catalog: Catalog,
  criteria: Map<string, unknown>,
): { courses: Course[]; passed: FilterableSection[] } {
  const service = filterServiceFor(catalog, criteria);
  const passed = service.apply(catalog.courses);
  const courses = service.resolveToCourses(passed);

  // As CourseList: a search keeps its relevance ranking, anything else
  // reads by department, then course number.
  const search = criteria.get('searchText') as
    SearchTextFilterCriteria | undefined;
  return {
    courses: search
      ? catalog.search.rank(courses, search.query)
      : [...courses].sort(byNumber),
    passed,
  };
}

/** The query's matches, one row per class, before sorting and paging. */
const matchesFor = (catalog: Catalog, query: CourseQuery) =>
  collapseCrossListings(
    filterCatalog(catalog, readQuery(catalog, query).criteria).courses,
  );

function termTotals(sections: Section[]): TermTotals {
  const seats = seatTotals(sections);
  return {
    openSeats: seats.available,
    sections: sections.length - seats.uncapped,
    uncapped: seats.uncapped,
  };
}

function totalsOf(courses: Course[], seatsYear: number | null): SearchTotals {
  const byCrn = new Map<number, Section>();
  for (const course of courses) {
    if (seatsYear !== null && course.academicYear !== seatsYear) continue;
    for (const s of primarySections(course)) byCrn.set(s.crn, s);
  }
  const sections = [...byCrn.values()];
  return {
    ...termTotals(sections),
    seatsYear,
    courses: courses.length,
    byTerm: byTerm(sections, termTotals),
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
): Notice[] {
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
    .map(m =>
      notice(
        'deliveryModeMissing',
        `${m}: none in ${where} matching the other filters.`,
      ),
    );
}

/** "Did you mean Gillian Smith?" for a search that found nothing. */
function instructorNotice(inYear: Course[], query: string): Notice[] {
  const names = suggestInstructors(inYear, query);
  if (!names.length) return [];
  return [
    notice(
      'instructorSuggested',
      `No instructor is named "${echo(query)}"; did you mean ${names.join(' or ')}? Search their courses with filters.searchText {query: "${names[0]}", professorOnly: true}.`,
    ),
  ];
}

/** '"AI" read as AI or artificial intelligence.', for each acronym in the query. */
function acronymNotices(catalog: Catalog, words: string[]): Notice[] {
  return words.flatMap(word => {
    const expansions = catalog.search.acronymExpansions(word);
    if (!expansions.length) return [];
    return [
      notice(
        'acronymRead',
        `"${word.toUpperCase()}" read as ${word.toUpperCase()} or ${expansions.join(' or ')}.`,
      ),
    ];
  });
}

const SORT_NOTICE: Record<Exclude<CourseQuery['sort'], 'relevance'>, string> = {
  rating:
    'Sorted by the best-rated lecture instructor; averages on 5+ ratings rank above those on fewer, unrated last.',
  difficulty:
    'Sorted by the easiest-rated lecture instructor (shown as "easiest rated"); averages on 5+ ratings rank above those on fewer, unrated last.',
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
  // By code and year: searching every year, PY 1731 of 2027-28 is not the
  // row RE 1731 of 2026-27 folds into.
  const key = (code: string, year: number | undefined) => `${code}@${year}`;
  const byCode = new Map<string, Course>();
  for (const course of courses) {
    const own = crnsOf(course);
    const duplicate = course.crossListedWith.some(code => {
      const prior = byCode.get(key(code, course.academicYear));
      if (!prior) return false;
      const priorCrns = crnsOf(prior);
      return own.size > 0 && [...own].every(crn => priorCrns.has(crn));
    });
    if (duplicate) continue;
    kept.push(course);
    byCode.set(key(courseCode(course), course.academicYear), course);
  }
  return kept;
}

/** The term dates of the course's year, for sections that keep their own. */
const datesOf = (catalog: Catalog, course: Course) =>
  termDates(catalog, course.academicYear ?? currentAcademicYear(catalog));

function rowSections(course: Course, catalog: Catalog): SectionBrief[] {
  const lectures = course.lectures?.length
    ? course.lectures.map(g => ({ s: g.section, kind: 'lecture' as const }))
    : (course.standaloneLabs ?? []).map((s: Section) => ({
        s,
        kind: 'standaloneLab' as const,
      }));
  const dates = datesOf(catalog, course);
  return lectures.map(({ s, kind }) =>
    toSectionBrief(s, kind, catalog.rmp, dates?.[s.computedTerm as TermLetter]),
  );
}

/**
 * The labs and discussions that passed every filter, each once, with the
 * matching lectures it goes with: the row's course is the filtered one, so
 * its lecture groups hold only those.
 */
function rowCompanions(course: Course, catalog: Catalog): CompanionBrief[] {
  const dates = datesOf(catalog, course);
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
        brief = {
          ...toSectionBrief(
            s,
            kind,
            catalog.rmp,
            dates?.[s.computedTerm as TermLetter],
          ),
          pairsWith: [],
        };
        byCrn.set(s.crn, brief);
      }
      brief.pairsWith.push(group.section.crn);
    }
  }
  return [...byCrn.values()];
}

/** Notices for courses lost through their labs and discussions alone. */
function companionNotices(
  criteria: Map<string, unknown>,
  passed: FilterableSection[],
  matches: Course[],
): Notice[] {
  if (!judgesCompanions(criteria)) return [];
  return companionDrops(passed, matches, criteria).map(drop =>
    notice('companionsDropped', dropNotice(drop)),
  );
}

/** A query's matches in the order asked for, and how each matched its text. */
interface Matched {
  read: ReadQuery;
  /** Every course that passed, before cross-listings collapse. */
  filtered: Course[];
  passed: FilterableSection[];
  matches: Course[];
  matchOf: Map<Course, SearchMatch>;
  /** The courses a code search names itself. */
  named: Course[];
  codeFirst: boolean;
  parsed: ParsedQuery | null;
  topic: string | null;
  codeSearch: string | null;
  search: CourseQueryResult['search'];
}

/** Filters, collapses and sorts the catalog for a query. */
function matchQuery(catalog: Catalog, query: CourseQuery): Matched {
  const read = readQuery(catalog, query);
  const { courses: filtered, passed } = filterCatalog(catalog, read.criteria);
  const collapsed = collapseCrossListings(filtered);

  const text = query.filters.searchText;
  const parsed = text ? catalog.search.parse(text.query) : null;
  // Instructor-only searches are about people, not topics.
  const topic = text && !text.professorOnly ? text.query : null;
  // A search naming a course by its code ("ES 3002").
  const codeSearch = topic !== null && parsed?.code?.dept ? topic : null;
  // How each course matched a text search.
  const matchOf = new Map<Course, SearchMatch>();
  if (topic !== null) {
    for (const c of collapsed)
      matchOf.set(c, catalog.search.describeMatch(c, topic));
  }
  // A code search's own course stays ahead of the courses that only name
  // it, whatever the sort: sorted by rating, MA 1022 sank below courses
  // mentioning it. Each part is sorted as asked.
  const named = collapsed.filter(c => matchOf.get(c) === 'code');
  const codeFirst =
    query.sort !== 'relevance' &&
    named.length > 0 &&
    named.length < collapsed.length;
  const matches = codeFirst
    ? [
        ...sortCourses(named, query.sort, catalog),
        ...sortCourses(
          collapsed.filter(c => matchOf.get(c) !== 'code'),
          query.sort,
          catalog,
        ),
      ]
    : sortCourses(collapsed, query.sort, catalog);

  const every = (kinds: SearchMatch[]) =>
    matchOf.size > 0 && [...matchOf.values()].every(m => kinds.includes(m));
  const search =
    text && parsed
      ? {
          query: text.query,
          onlyMentions: every(['mentions', 'scattered']),
          descriptionOnly:
            parsed.words.length >= 2 && every(['description', 'scattered']),
        }
      : null;

  return {
    read,
    filtered,
    passed,
    matches,
    matchOf,
    named,
    codeFirst,
    parsed,
    topic,
    codeSearch,
    search,
  };
}

/** The notices, and for a search that missed, what to change. */
function explainMatches(
  catalog: Catalog,
  query: CourseQuery,
  m: Matched,
): Pick<
  CourseQueryResult,
  'notices' | 'relaxations' | 'unrestrictive' | 'leftOut'
> {
  const { read, matches, named, parsed, topic, codeSearch } = m;
  const text = query.filters.searchText;
  const inYear = catalog.courses.filter(
    c => read.year === 'all' || c.academicYear === read.year,
  );
  const notices = [
    ...(topic !== null
      ? knownTermNotes(topic, inYear).map(n => notice('knownTerm', n))
      : []),
    ...read.notices,
    ...companionNotices(read.criteria, m.passed, m.filtered),
  ];
  const unrestrictive =
    matches.length === 0
      ? unrestrictiveFilters(catalog, query, read.criteria)
      : [];
  const relaxations =
    matches.length === 0
      ? relax(catalog, query, unrestrictive, codeSearch)
      : [];
  // The named course itself missing, even with mentions of it listed.
  const leftOut =
    named.length === 0 ? leftOutByDefaults(catalog, query, codeSearch) : [];
  if (matches.length === 0 && text) {
    notices.push(...instructorNotice(inYear, text.query));
  }
  if (matches.length > 0 && query.offset >= matches.length) {
    notices.push(
      notice(
        'offsetPastEnd',
        `Offset ${query.offset} is past the end: there are only ${matches.length} matching courses.`,
      ),
    );
  }
  if (topic !== null && parsed)
    notices.push(...acronymNotices(catalog, parsed.words));
  const ignored = parsed?.ignored ?? [];
  if (ignored.length) {
    notices.push(
      notice(
        'wordsIgnored',
        `Searched by the first ${MAX_QUERY_WORDS} distinct words; ignored: ${echo(ignored.join(' '))}. Use one or two topic words.`,
      ),
    );
  }
  if (query.sort !== 'relevance') {
    notices.push(
      notice(
        'sorted',
        SORT_NOTICE[query.sort] +
          (m.codeFirst
            ? ` The ${one(named.length, 'course', 'courses')} the code names ${one(named.length, 'comes', 'come')} first, then the rest in that order.`
            : ''),
      ),
    );
  }
  notices.push(...missingModes(query, matches, read.year));
  if (text && REGISTRATION_RE.test(text.query))
    notices.push(notice('registration', REGISTRATION_NOTE));
  if (m.search?.descriptionOnly && query.limit === undefined) {
    if (matches.length > LOOSE_LIMIT) {
      notices.push(
        notice(
          'closestOnly',
          `No course name has these words, only descriptions: listing the closest ${LOOSE_LIMIT} of ${matches.length}. Pass limit for more, or search one or two topic words.`,
        ),
      );
    }
  }
  if (read.year === 'all') {
    notices.push(
      notice(
        'allYears',
        `Searching every year; only ${yearLabel(currentAcademicYear(catalog))} can be scheduled.`,
      ),
    );
  }
  return { notices, relaxations, unrestrictive, leftOut };
}

/** The page of rows asked for, and its limit. */
function pageRows(
  catalog: Catalog,
  query: CourseQuery,
  m: Matched,
): { limit: number; courses: CourseRow[] } {
  const includeSections =
    query.includeSections ??
    (!picksCoursesOnly(query.filters) ||
      !!query.filters.searchText?.professorOnly);
  const limit =
    query.limit ?? (m.search?.descriptionOnly ? LOOSE_LIMIT : DEFAULT_LIMIT);
  const courses = m.matches.slice(query.offset, query.offset + limit).map(c => {
    // Under the difficulty sort, the row's top instructor is the easiest
    // rated, the one the order went by.
    const row: CourseRow = toCourseSummary(
      c,
      catalog.rmp,
      query.sort === 'difficulty' ? 'difficulty' : 'rating',
    );
    const early =
      c.academicYear !== undefined && isUnpublished(catalog, c.academicYear);
    if (early) row.earlyEntry = true;
    if (includeSections && !early) {
      row.sections = rowSections(c, catalog);
      const companions = rowCompanions(c, catalog);
      if (companions.length) row.companions = companions;
    }
    const match = m.matchOf.get(c);
    if (match) row.match = match;
    return row;
  });
  return { limit, courses };
}

export function runCourseQuery(
  catalog: Catalog,
  query: CourseQuery,
): CourseQueryResult {
  const matched = matchQuery(catalog, query);
  const { read, matches } = matched;
  const { notices, relaxations, unrestrictive, leftOut } = explainMatches(
    catalog,
    query,
    matched,
  );
  const { limit, courses } = pageRows(catalog, query, matched);

  return {
    year: read.year,
    sort: query.sort,
    total: matches.length,
    offset: query.offset,
    limit,
    courses,
    search: matched.search,
    relaxations,
    unrestrictive,
    leftOut,
    totals: totalsOf(
      matches,
      read.year === 'all' ? currentAcademicYear(catalog) : null,
    ),
    excludedEndedTerms: read.excludedEndedTerms,
    dataAsOf: catalog.lastUpdated,
    dataAgeDays: seatDataAge(catalog),
    notices,
  };
}
