/**
 * The course API's non-search reads: one course by id or code, the
 * department list, and catalog metadata. Shared by the HTTP routes and the
 * MCP tools.
 */
import type { Course } from '../types/types';
import { findCourseById } from '../types/ScheduleState';
import { findCatalogCourse } from '../services/degree/catalogLookup';
import { currentAcademicYear, type Catalog } from './catalog';

// Catalog ids are DEPT-NUMBER-YEAR, e.g. "CS-2102-2026".
const COURSE_ID_RE = /^[A-Za-z]+-[A-Za-z0-9]+-\d{4}$/;

/**
 * A course by catalog id ("CS-2102-2026") or by code ("CS 2102", "CS2102",
 * "CS-2102"). A code resolves in `year` when given; otherwise in the current
 * academic year, else the newest year that has it.
 */
export function findCourse(
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

interface DepartmentInfo {
  abbr: string;
  name: string;
  courseCount: number;
}

/** Departments with a course in `year` ('all': in any year), A-Z. */
export function listDepartments(
  catalog: Catalog,
  year: number | 'all' = currentAcademicYear(catalog),
): DepartmentInfo[] {
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

interface TermDates {
  start: string;
  end: string;
}

interface CatalogMeta {
  /** When the refresh job last saw new data from WPI. */
  lastUpdated: string | null;
  /** Fall year of the academic year in session: 2026 is 2026-27. */
  currentAcademicYear: number;
  availableYears: number[];
  /** Quarter start and end dates (YYYY-MM-DD) per academic year. */
  termBounds: Record<string, Record<'A' | 'B' | 'C' | 'D', TermDates>>;
}

export function catalogMeta(catalog: Catalog): CatalogMeta {
  const termBounds: CatalogMeta['termBounds'] = {};
  for (const [year, terms] of Object.entries(
    catalog.termBounds.getAllBounds() ?? {},
  )) {
    const dates = (t: 'A' | 'B' | 'C' | 'D') => ({
      start: terms[t].startDate,
      end: terms[t].endDate,
    });
    termBounds[year] = {
      A: dates('A'),
      B: dates('B'),
      C: dates('C'),
      D: dates('D'),
    };
  }

  return {
    lastUpdated: catalog.lastUpdated,
    currentAcademicYear: currentAcademicYear(catalog),
    availableYears: catalog.years,
    termBounds,
  };
}
