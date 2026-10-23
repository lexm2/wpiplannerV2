/**
 * The course API's non-search reads: one course by id, code or CRN (or its
 * outlook in a year not yet published), the department list, catalog
 * metadata, and the loose names a caller may use for departments and degree
 * attributes. Shared by the HTTP routes and the MCP tools.
 */
import type { Course, Department } from '../types/types';
import { findCourseById } from '../types/ScheduleState';
import { findCatalogCourse } from '../services/degree/catalogLookup';
import { getAllSections } from '../utils/courseUtils';
import { closestMatches, editDistance } from '../utils/editDistance';
import {
  matchCourseWords,
  parseSearchQuery,
  rankCoursesByRelevance,
} from '../utils/searchUtils';
import { currentAcademicYear, type Catalog } from './catalog';
import {
  endedTerms,
  isEarlyEntry,
  isUnpublished,
  seatDataAge,
  termDates,
  termNow,
  today,
  yearInfo,
  yearLabel,
  yearStatus,
  type DateSpan,
  type TermLetter,
  type TermNow,
  type YearInfo,
} from './calendar';
import { ApiError, echo } from './errors';
import { andList, plural } from './text';
import { forecastCourse, type Forecast } from './forecast';
import {
  courseCode,
  statementOf,
  termsOf,
  toCourseDetail,
  toCourseSummary,
  type CourseDetail,
  type CourseSummary,
  type DetailOptions,
} from './serialize';

// Catalog ids are DEPT-NUMBER-YEAR, e.g. "CS-2102-2026".
const COURSE_ID_RE = /^[A-Za-z]+-[A-Za-z0-9]+-\d{4}$/;
// "CS 2102", "cs2102", "CS-2102".
const COURSE_CODE_RE = /^([A-Za-z]{2,5})[\s-]*(\d{2,4}[A-Za-z]?)$/;
// Codes always have letters, so a bare number is a CRN.
const CRN_RE = /^\d+$/;

/** Longest course input looked up: a title fits, an essay does not. */
export const MAX_COURSE_INPUT = 200;

/**
 * A course by catalog id ("CS-2102-2026") or by code ("CS 2102", "CS2102",
 * "CS-2102"). A code resolves in `year` when given; otherwise in the current
 * academic year, else the newest year that has it.
 */
function findCourse(
  catalog: Catalog,
  idOrCode: string,
  year?: number,
): Course | null {
  const key = idOrCode.trim();
  if (COURSE_ID_RE.test(key)) {
    return findCourseById(key.toUpperCase(), catalog.departments);
  }
  // An explicit year is a request for that year, never another one.
  return findCatalogCourse(
    key.replace(/-/g, ' '),
    year ?? currentAcademicYear(catalog),
    catalog.departments,
    { fallbackToNewest: year === undefined },
  );
}

/** Every catalog course with this code, oldest year first. */
function coursesWithCode(catalog: Catalog, code: string): Course[] {
  const want = code.toUpperCase();
  return catalog.courses
    .filter(c => courseCode(c).toUpperCase() === want)
    .sort((a, b) => (a.academicYear ?? 0) - (b.academicYear ?? 0));
}

/** "2026-27 and early 2027-28 entries": the years the catalog has courses in. */
function coverage(catalog: Catalog): string {
  const years = yearInfo(catalog)
    .filter(y => y.courseCount > 0)
    .map(y =>
      y.status === 'not yet published'
        ? `early ${yearLabel(y.year)} entries`
        : yearLabel(y.year),
    );
  return andList(years) || 'no year';
}

/**
 * For a year the catalog has nothing for at all: "not offered" would be a
 * guess; the year is simply not in the data.
 */
function yearNotInCatalog(catalog: Catalog, year: number): ApiError {
  return new ApiError(
    `${yearLabel(year)} is not in this catalog (it covers ${coverage(catalog)}), so nothing can be said about it here.`,
    404,
    { year, years: catalog.years },
  );
}

/** An error naming the years a code exists in, or the codes it is close to. */
function courseNotFound(
  catalog: Catalog,
  input: string,
  year: number,
): ApiError {
  const key = input.trim();
  const inYear = `in ${yearLabel(year)}`;

  // A well-formed id of a year the catalog lacks: "CS-2102-1999".
  const id = COURSE_ID_RE.test(key) ? Number(key.slice(-4)) : null;
  if (id !== null && yearStatus(catalog, id).courseCount === 0) {
    return yearNotInCatalog(catalog, id);
  }
  if (id !== null) {
    return courseNotFound(catalog, key.slice(0, -5), id);
  }
  if (year < currentAcademicYear(catalog) && !catalog.years.includes(year)) {
    return yearNotInCatalog(catalog, year);
  }

  if (CRN_RE.test(key)) {
    return new ApiError(
      `No section has CRN ${key}. Get CRNs from get_course or search_courses; for a course code, include the department ("MA 1022").`,
      404,
    );
  }

  const m = COURSE_CODE_RE.exec(key);
  if (m) {
    const code = `${m[1].toUpperCase()} ${m[2].toUpperCase()}`;
    const years = coursesWithCode(catalog, code).map(c => c.academicYear);
    if (years.length > 0) {
      return new ApiError(
        `${code} is not in the ${yearLabel(year)} catalog; it is in ${years
          .map(y => (y === undefined ? 'an undated year' : yearLabel(y)))
          .join(', ')}. Pass that year to see it.`,
        404,
        { yearsWithCode: years },
      );
    }
    const codes = catalog.courses
      .filter(c => c.academicYear === year)
      .map(courseCode);
    const close = closestMatches(code, codes, { limit: 2 });
    const knownDept = catalog.departments.some(
      d => d.abbreviation.toUpperCase() === m[1].toUpperCase(),
    );
    const hint = knownDept
      ? ''
      : ` There is no department ${m[1].toUpperCase()}; list_departments has them all.`;
    return new ApiError(
      `No course ${code} ${inYear}.${close.length ? ` Close codes: ${close.join(', ')}.` : ''}${hint} search_courses finds courses by topic or name.`,
      404,
      { suggestions: close },
    );
  }

  const close = closestMatches(
    key.toUpperCase(),
    catalog.courses.filter(c => c.academicYear === year).map(courseCode),
    { limit: 2 },
  );
  return new ApiError(
    `"${echo(key)}" is not a course id, code or CRN.${close.length ? ` Close codes: ${close.join(', ')}.` : ''} Give a code like "CS 2102", or find the course by name with search_courses.`,
    404,
    { suggestions: close },
  );
}

/** A course title as compared: lowercase words, "&" read as "and". */
const titleWords = (title: string) => normalName(title);

/** Suggestions an unresolved course name lists. */
const MAX_NAME_SUGGESTIONS = 3;

/**
 * The one course of `year` whose title is `name` or starts with it, or
 * within two edits of it ("Critical AI Literacy" for IMGD 2002 Critical AI
 * Literacy in the Designed World); cross-listed copies of one class count
 * once. Null when no title is close; throws with the likeliest courses
 * when several are.
 */
function courseByName(
  catalog: Catalog,
  name: string,
  year: number,
): Course | null {
  const want = titleWords(name);
  if (want.length < 4) return null;
  const inYear = catalog.courses.filter(c => c.academicYear === year);
  const exact = inYear.filter(c => titleWords(c.name) === want);
  const close = exact.length
    ? exact
    : inYear.filter(c => {
        const title = titleWords(c.name);
        return (
          title.startsWith(`${want} `) ||
          (want.length >= 8 && editDistance(want, title, 2) <= 2)
        );
      });
  const classes = distinctClasses(close);
  if (classes.length === 1) return classes[0];

  const query = parseSearchQuery(name);
  const ranked = rankCoursesByRelevance(
    classes.length
      ? classes
      : inYear.filter(c => matchCourseWords(c, query).all),
    name,
  ).slice(0, MAX_NAME_SUGGESTIONS);
  if (!ranked.length) return null;
  const list = ranked.map(c => `${courseCode(c)} ${c.name}`);
  throw new ApiError(
    `${classes.length ? `"${echo(name)}" fits ${classes.length} course titles` : `"${echo(name)}" is not a course title, id, code or CRN`}. Closest: ${list.join('; ')}. Give a code like "CS 2102".`,
    404,
    { suggestions: ranked.map(courseCode) },
  );
}

/** The courses with cross-listed copies of one class (same CRNs) dropped. */
function distinctClasses(courses: Course[]): Course[] {
  const seen = new Set<string>();
  return courses.filter(c => {
    const crns = getAllSections(c)
      .map(s => s.crn)
      .sort((a, b) => a - b)
      .join(',');
    const key = crns || courseCode(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detailContext(catalog: Catalog, course: Course) {
  const year = course.academicYear ?? currentAcademicYear(catalog);
  return {
    rmp: catalog.rmp,
    endedTerms: endedTerms(catalog, year),
    nextYear: nextYearForecast(catalog, course),
    earlyEntry: isEarlyEntry(catalog, course),
  };
}

/**
 * The course's outlook for the year after its own, when that year has not
 * been published; null once it has (its real schedule answers instead).
 */
function nextYearForecast(catalog: Catalog, course: Course): Forecast | null {
  // Only the current year's schedule is a sound base to read on from.
  if (course.academicYear !== currentAcademicYear(catalog)) return null;
  const next = course.academicYear + 1;
  if (!isUnpublished(catalog, next)) return null;
  return forecastFor(catalog, course, next);
}

function forecastFor(catalog: Catalog, course: Course, year: number): Forecast {
  const terms = termsOf(getAllSections(course).filter(s => !s.isInterestList));
  return forecastCourse(
    course,
    year,
    course.academicYear ?? currentAcademicYear(catalog),
    terms,
  );
}

/** A course's outlook in an unpublished year, from the year we have. */
export interface CoursePlan {
  forecast: Forecast;
  course: CourseSummary &
    Pick<
      CourseDetail,
      'description' | 'recommendedBackground' | 'prerequisites' | 'courseTypes'
    >;
}

export type CourseLookup =
  | { kind: 'course'; detail: CourseDetail; notices: string[] }
  | { kind: 'plan'; plan: CoursePlan; notices: string[] };

export interface CourseLookupOptions extends DetailOptions {
  year?: number;
}

/**
 * One course by id, code or CRN, as the get_course tool and GET
 * /courses/:id answer it. A year whose schedule is not published yet
 * answers with the current year's course and its outlook instead; anything
 * not found throws an ApiError that says where to look.
 */
export function lookupCourse(
  catalog: Catalog,
  input: string,
  options: CourseLookupOptions = {},
): CourseLookup {
  const { year, ...detailOptions } = options;
  const notices: string[] = [];
  // "CRN 349614" as well as "349614"; "CRN0350041" is CRN 350041.
  const key = input
    .trim()
    .replace(/^crn[\s#:.-]*(?=\d+$)/i, '')
    .replace(/^0+(?=\d+$)/, '');
  const current = currentAcademicYear(catalog);
  if (!key) {
    throw new ApiError(
      'Give a course code ("CS 2102"), catalog id, CRN or title.',
    );
  }
  if (key.length > MAX_COURSE_INPUT) {
    throw new ApiError(
      `"${echo(key)}" is too long for a course (${MAX_COURSE_INPUT} characters at most); give a code like "CS 2102", or find the course by name with search_courses.`,
    );
  }

  let course: Course | null = null;
  if (CRN_RE.test(key)) {
    const entry = catalog.sectionsByCrn.get(Number(key));
    const own = entry?.courses[0].academicYear;
    // A CRN names one year's section; another year asked for is not it,
    // save an unpublished year, which is answered with the outlook below.
    if (
      entry &&
      year !== undefined &&
      own !== undefined &&
      own !== year &&
      !(year > current && isUnpublished(catalog, year))
    ) {
      throw new ApiError(
        `CRN ${key} is ${courseCode(entry.courses[0])} section ${entry.section.number} of ${yearLabel(own)}, not ${yearLabel(year)}. Leave out year to see it, or give the course code with year ${year}.`,
        404,
        { crn: Number(key), year: own },
      );
    }
    if (entry) {
      course = entry.courses[0];
      const s = entry.section;
      const also = entry.courses.slice(1).map(courseCode);
      const of =
        course.academicYear !== undefined && course.academicYear !== current
          ? ` of ${yearLabel(course.academicYear)}`
          : '';
      notices.push(
        `CRN ${key} is ${courseCode(course)} section ${s.number} (${s.computedTerm} term${of})${also.length ? `, also listed as ${also.join(', ')}` : ''}.`,
      );
    }
  } else {
    course = findCourse(catalog, key, year);
    if (!course && !COURSE_ID_RE.test(key) && !COURSE_CODE_RE.test(key)) {
      // A name: in the year asked for, or this year's for a later one.
      const named =
        courseByName(catalog, key, year ?? current) ??
        (year !== undefined && year > current
          ? courseByName(catalog, key, current)
          : null);
      if (named) {
        course = named;
        notices.push(
          `"${echo(key)}" read as ${courseCode(named)} ${named.name}.`,
        );
      }
    }
  }

  if (year !== undefined) {
    const status = yearStatus(catalog, year);
    // Only the year after this one can be read off this year's schedule.
    if (year > current + 1 && status.status === 'not yet published') {
      throw new ApiError(
        `Only next year (${current + 1}, ${yearLabel(current + 1)}) can be forecast, from this year's schedule; ${yearLabel(year)} is too far ahead. Call get_course with year ${current + 1}, or without a year for ${yearLabel(current)}.`,
        422,
        { year, forecastYear: current + 1 },
      );
    }
    if (year < current && status.courseCount === 0) {
      throw yearNotInCatalog(catalog, year);
    }
  }

  if (year !== undefined && year > current) {
    // One of the year's early entries answers as itself, below.
    if (isUnpublished(catalog, year) && course?.academicYear !== year) {
      const base = course ?? findCourse(catalog, key);
      if (!base) throw courseNotFound(catalog, key, current);
      const summary = toCourseSummary(base, catalog.rmp);
      return {
        kind: 'plan',
        notices,
        plan: {
          forecast: forecastFor(catalog, base, year),
          course: {
            ...summary,
            description: base.description,
            recommendedBackground: statementOf(base, 'recommendedBackground'),
            prerequisites: statementOf(base, 'prerequisites'),
            courseTypes: base.courseTypes,
          },
        },
      };
    }
  }

  if (!course) throw courseNotFound(catalog, key, year ?? current);
  // However it was reached (code and year, id or CRN), an early entry says
  // so: its sections are WPI's first listing, not a published schedule.
  if (isEarlyEntry(catalog, course)) {
    const { courseCount } = yearStatus(catalog, course.academicYear!);
    notices.push(
      `${yearLabel(course.academicYear!)} is not published yet; this is one of its ${plural(courseCount, 'early entry', 'early entries')}: its term, times, room and instructor are tentative and may change, and it cannot be registered for yet.`,
    );
  }
  if (course.academicYear !== undefined && course.academicYear < current) {
    notices.push(
      `This is the ${yearLabel(course.academicYear)} offering, a past year.`,
    );
  }
  return {
    kind: 'course',
    notices,
    detail: toCourseDetail(
      course,
      detailContext(catalog, course),
      detailOptions,
    ),
  };
}

interface DepartmentInfo {
  abbr: string;
  name: string;
  courseCount: number;
}

/** Years with courses, for messages: "2026-27 (current), 2027-28 (not yet published)". */
function yearsText(catalog: Catalog): string {
  return yearInfo(catalog)
    .filter(y => y.courseCount > 0)
    .map(y => `${y.year} = ${yearLabel(y.year)} (${y.status})`)
    .join(', ');
}

/** The ApiError for a search or listing of a year with nothing to show. */
export function unpublishedYearError(
  catalog: Catalog,
  year: number,
): ApiError | null {
  const info = yearStatus(catalog, year);
  const current = currentAcademicYear(catalog);
  if (info.status === 'not yet published') {
    return new ApiError(
      `The ${yearLabel(year)} schedule is not published yet: the catalog has ${info.courseCount ? plural(info.courseCount, 'early entry', 'early entries') : 'nothing'} for it, against ${yearStatus(catalog, current).courseCount} courses in ${yearLabel(current)}. WPI sets each year's terms and times when it publishes, so they cannot be searched yet. To plan ahead, search the current year (${current}) and narrow with filters.offeringPattern (categories [1] = offered every year), then call get_course with year ${year} for a course's outlook.`,
      422,
      { year, status: info.status, courseCount: info.courseCount },
    );
  }
  if (info.courseCount === 0) {
    return new ApiError(
      `No courses in ${yearLabel(year)}. Years in the catalog: ${yearsText(catalog)}.`,
      404,
      { year, status: info.status, courseCount: 0 },
    );
  }
  return null;
}

/** Departments with a course in `year` ('all': in any year), A-Z. */
export function listDepartments(
  catalog: Catalog,
  year: number | 'all' = currentAcademicYear(catalog),
): DepartmentInfo[] {
  if (year !== 'all' && yearStatus(catalog, year).courseCount === 0) {
    throw unpublishedYearError(catalog, year)!;
  }
  const inYear = (c: Course) => year === 'all' || c.academicYear === year;
  return catalog.departments
    .map(d => ({
      abbr: d.abbreviation,
      name: d.name,
      courseCount: d.courses.filter(inYear).length,
    }))
    .filter(d => d.courseCount > 0)
    .sort((a, b) => a.abbr.localeCompare(b.abbr));
}

/** A department name as compared: lowercase words, "&" read as "and". */
function normalName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join(' ');
}

// Not part of a department's initials: "Physics for Educators" is PE.
const INITIALS_STOP = new Set(['and', 'of', 'for', 'the', 'in']);

const initialsOf = (name: string) =>
  normalName(name)
    .split(' ')
    .filter(w => !INITIALS_STOP.has(w))
    .map(w => w[0])
    .join('');

/**
 * Department abbreviations for what a caller wrote: an abbreviation in any
 * case ("cs"), a full name ("Computer Science", "and" or "&" alike), or a
 * name only one department comes close to ("Robotics"). A loose match is
 * reported in `notes`; one that fits several departments, or none, throws
 * with them, likeliest first.
 */
export function resolveDepartments(
  catalog: Catalog,
  inputs: string[],
): { abbrs: string[]; notes: string[] } {
  const departments = uniqueDepartments(catalog.departments);
  const resolved = new Set<string>();
  const notes: string[] = [];
  const label = (d: Department) => `${d.abbreviation} (${d.name})`;
  for (const input of inputs) {
    const want = normalName(input);
    const exact =
      departments.find(d => d.abbreviation.toLowerCase() === want) ??
      departments.find(d => normalName(d.name) === want);
    if (exact) {
      resolved.add(exact.abbreviation);
      continue;
    }
    const near = closestDepartments(want, departments, catalog);
    if (near.length === 1) {
      resolved.add(near[0].abbreviation);
      notes.push(`Department "${echo(input)}" read as ${label(near[0])}.`);
      continue;
    }
    throw new ApiError(
      near.length
        ? `Department "${echo(input)}" could be ${near.map(label).join(', ')}. Use an abbreviation (list_departments has them all).`
        : `Unknown department "${echo(input)}". Use abbreviations from list_departments.`,
      400,
      { department: input, candidates: near.map(d => d.abbreviation) },
    );
  }
  return { abbrs: [...resolved], notes };
}

/** Departments a loose input suggests, at most this many. */
const MAX_CANDIDATES = 6;

/**
 * Departments `want` could mean, likeliest first:
 * 1. its letters inside a longer abbreviation, or in the name's initials
 *    ("PE": WPE, Wellness & Physical Education; MPE, Physics for Educators);
 * 2. a name word starting with it, or for 4+ letters anywhere in the name;
 * 3. the abbreviation, name or a name word within an edit or two (two for
 *    5+ letters): "Robotcs" finds Robotics Engineering.
 * Ties go to the department with more courses in the current year, then
 * A-Z.
 */
function closestDepartments(
  want: string,
  departments: Department[],
  catalog: Catalog,
): Department[] {
  const compact = want.replace(/ /g, '');
  const limit = want.length >= 5 ? 2 : 1;
  const year = currentAcademicYear(catalog);
  const size = (d: Department) =>
    d.courses.filter(c => c.academicYear === year).length;
  const tier = (d: Department): number | null => {
    const abbr = d.abbreviation.toLowerCase();
    const name = normalName(d.name);
    if (
      compact.length >= 2 &&
      /^[a-z]+$/.test(compact) &&
      (abbr.includes(compact) || initialsOf(d.name).includes(compact))
    ) {
      return 0;
    }
    if (name.split(' ').some(w => w.startsWith(want))) return 1;
    if (want.length >= 4 && name.includes(want)) return 1;
    const distance = Math.min(
      ...[abbr, name, ...name.split(' ')].map(n =>
        editDistance(want, n, limit),
      ),
    );
    return distance <= limit ? 1 + distance : null;
  };
  return departments
    .map(d => ({ d, tier: tier(d) }))
    .filter((x): x is { d: Department; tier: number } => x.tier !== null)
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        size(b.d) - size(a.d) ||
        a.d.abbreviation.localeCompare(b.d.abbreviation),
    )
    .slice(0, MAX_CANDIDATES)
    .map(({ d }) => d);
}

function uniqueDepartments(departments: Department[]): Department[] {
  const seen = new Map<string, Department>();
  for (const d of departments) {
    if (!seen.has(d.abbreviation)) seen.set(d.abbreviation, d);
  }
  return [...seen.values()];
}

/** Each degree attribute in the catalog with its course count in `year`. */
function degreeAttributeCounts(
  catalog: Catalog,
  year: number,
): { name: string; courseCount: number }[] {
  const counts = new Map<string, number>();
  for (const course of catalog.courses) {
    if (course.academicYear !== year) continue;
    for (const a of course.degreeAttributes) {
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([name, courseCount]) => ({ name, courseCount }))
    .sort(
      (a, b) => b.courseCount - a.courseCount || a.name.localeCompare(b.name),
    );
}

/**
 * Catalog degree attributes for what a caller wrote: the name in any case,
 * or the start of exactly one ("social science", "humanities"). Throws with
 * the full list otherwise.
 */
export function resolveDegreeAttributes(
  catalog: Catalog,
  inputs: string[],
): string[] {
  const known = [...new Set(catalog.courses.flatMap(c => c.degreeAttributes))];
  return inputs.map(input => {
    const want = input.trim().toLowerCase();
    const exact = known.find(a => a.toLowerCase() === want);
    if (exact) return exact;
    const partial = known.filter(a => a.toLowerCase().startsWith(want));
    if (partial.length === 1) return partial[0];
    throw new ApiError(
      `Unknown degree attribute "${echo(input)}". The catalog's attributes: ${known.sort().join('; ')}.`,
      400,
      { attribute: input, known },
    );
  });
}

export const DELIVERY_MODES = ['In-Person', 'Online', 'Hybrid'] as const;

interface CatalogMeta {
  /** Today on the server's clock, YYYY-MM-DD. */
  today: string;
  /** When the refresh job last saw new data from WPI; seat counts are as of then. */
  dataAsOf: string | null;
  /** Whole days since then (see seatDataAge). */
  dataAgeDays: number | null;
  /** Fall year of the academic year in session: 2026 is 2026-27. */
  currentAcademicYear: number;
  /** The quarter in session, or the ones either side of today. */
  currentTerm: TermNow;
  /** Every year with its course count and how complete its schedule is. */
  years: YearInfo[];
  /**
   * Term start and end dates (YYYY-MM-DD) per published academic year, F
   * (A's start to B's end) and S (C's start to D's end) derived.
   */
  termDates: Record<string, Record<TermLetter, DateSpan>>;
  /** Degree attributes of the current year's courses, most common first. */
  degreeAttributes: { name: string; courseCount: number }[];
  deliveryModes: readonly string[];
}

export function catalogMeta(catalog: Catalog): CatalogMeta {
  // An unpublished year's dates are estimates, not WPI's; leave them out.
  const dates: CatalogMeta['termDates'] = {};
  for (const year of Object.keys(catalog.termBounds.getAllBounds() ?? {})) {
    const d = termDates(catalog, Number(year));
    const published = !isUnpublished(catalog, Number(year));
    if (d && published) dates[year] = d;
  }
  const current = currentAcademicYear(catalog);

  return {
    today: today(catalog),
    dataAsOf: catalog.lastUpdated,
    dataAgeDays: seatDataAge(catalog),
    currentAcademicYear: current,
    currentTerm: termNow(catalog),
    years: yearInfo(catalog),
    termDates: dates,
    degreeAttributes: degreeAttributeCounts(catalog, current),
    deliveryModes: DELIVERY_MODES,
  };
}
