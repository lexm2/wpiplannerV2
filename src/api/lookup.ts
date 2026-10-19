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
import { closestMatches } from '../utils/editDistance';
import { currentAcademicYear, type Catalog } from './catalog';
import {
  endedTerms,
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
import { ApiError } from './errors';
import { forecastCourse, type Forecast } from './forecast';
import {
  courseCode,
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

/** An error naming the years a code exists in, or the codes it is close to. */
function courseNotFound(
  catalog: Catalog,
  input: string,
  year: number,
): ApiError {
  const key = input.trim();
  const inYear = `in ${yearLabel(year)}`;

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
    `"${key}" is not a course id, code or CRN.${close.length ? ` Close codes: ${close.join(', ')}.` : ''} Give a code like "CS 2102", or find the course by name with search_courses.`,
    404,
    { suggestions: close },
  );
}

function detailContext(catalog: Catalog, course: Course) {
  const year = course.academicYear ?? currentAcademicYear(catalog);
  return {
    rmp: catalog.rmp,
    endedTerms: endedTerms(catalog, year),
    nextYear: nextYearForecast(catalog, course),
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
  if (yearStatus(catalog, next).status !== 'not yet published') return null;
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
  const key = input.trim();
  const current = currentAcademicYear(catalog);

  let course: Course | null = null;
  if (CRN_RE.test(key)) {
    const entry = catalog.sectionsByCrn.get(Number(key));
    if (entry) {
      course = entry.courses[0];
      const s = entry.section;
      const also = entry.courses.slice(1).map(courseCode);
      notices.push(
        `CRN ${key} is ${courseCode(course)} section ${s.number} (${s.computedTerm} term)${also.length ? `, also listed as ${also.join(', ')}` : ''}.`,
      );
    }
  } else {
    course = findCourse(catalog, key, year);
  }

  if (year !== undefined && year > current) {
    const status = yearStatus(catalog, year);
    if (status.status === 'not yet published') {
      if (course?.academicYear === year) {
        notices.push(
          `${yearLabel(year)} is not published yet; this is one of its ${status.courseCount} early entries and may change.`,
        );
      } else {
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
              recommendedBackground: base.recommendedBackground ?? null,
              prerequisites: base.prerequisites ?? null,
              courseTypes: base.courseTypes,
            },
          },
        };
      }
    }
  }

  if (!course) throw courseNotFound(catalog, key, year ?? current);
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
      `The ${yearLabel(year)} schedule is not published yet: the catalog has ${info.courseCount ? `${info.courseCount} early entr${info.courseCount === 1 ? 'y' : 'ies'}` : 'nothing'} for it, against ${yearStatus(catalog, current).courseCount} courses in ${yearLabel(current)}. WPI sets each year's terms and times when it publishes, so they cannot be searched yet. To plan ahead, search the current year (${current}) and narrow with filters.offeringPattern (categories [1] = offered every year), then call get_course with year ${year} for a course's outlook.`,
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

/**
 * Department abbreviations for what a caller wrote: an abbreviation in any
 * case ("cs"), a full name ("Computer Science"), or a word only one
 * department's name has ("Robotics"). Throws with close matches otherwise.
 */
export function resolveDepartments(
  catalog: Catalog,
  inputs: string[],
): string[] {
  const departments = uniqueDepartments(catalog.departments);
  const resolved = new Set<string>();
  for (const input of inputs) {
    const want = input.trim().toLowerCase();
    const byAbbr = departments.find(d => d.abbreviation.toLowerCase() === want);
    const byName = departments.find(d => d.name.toLowerCase() === want);
    const partial = departments.filter(d =>
      d.name.toLowerCase().includes(want),
    );
    const found =
      byAbbr ?? byName ?? (partial.length === 1 ? partial[0] : undefined);
    if (found) {
      resolved.add(found.abbreviation);
      continue;
    }
    const candidates =
      partial.length > 1
        ? partial.map(d => `${d.abbreviation} (${d.name})`)
        : closestMatches(
            input.trim(),
            departments.flatMap(d => [d.abbreviation, d.name]),
            { limit: 2 },
          ).map(n => {
            const d = departments.find(
              x => x.abbreviation === n || x.name === n,
            )!;
            return `${d.abbreviation} (${d.name})`;
          });
    throw new ApiError(
      `${partial.length > 1 ? 'Ambiguous' : 'Unknown'} department "${input}".${candidates.length ? ` ${partial.length > 1 ? 'It could be' : 'Close matches'}: ${[...new Set(candidates)].join(', ')}.` : ''} Use abbreviations from list_departments.`,
      400,
      { department: input, candidates },
    );
  }
  return [...resolved];
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
      `Unknown degree attribute "${input}". The catalog's attributes: ${known.sort().join('; ')}.`,
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
    const published =
      yearStatus(catalog, Number(year)).status !== 'not yet published';
    if (d && published) dates[year] = d;
  }
  const current = currentAcademicYear(catalog);

  return {
    today: today(catalog),
    dataAsOf: catalog.lastUpdated,
    currentAcademicYear: current,
    currentTerm: termNow(catalog),
    years: yearInfo(catalog),
    termDates: dates,
    degreeAttributes: degreeAttributeCounts(catalog, current),
    deliveryModes: DELIVERY_MODES,
  };
}
