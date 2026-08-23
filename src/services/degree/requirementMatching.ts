/**
 * Maps the courses of an *existing planner schedule* onto the imported degree
 * requirements - the reverse of planMatcher.ts (which turns the plan into a
 * schedule). Used by the Degree page's "Check current schedule" preview, its
 * drag-to-rebucket targets, and the empty-slot "browse courses" filter.
 *
 * The Workday export lists, per requirement, only the courses already *applied*
 * to it - never a full eligible-course pool (see academicProgressParser.ts). So
 * matching is hybrid: a schedule course whose code is already listed under a
 * requirement is an `exact` match; otherwise it's bucketed by department /
 * category `heuristic`. Heuristics are deliberately loose - drag-to-correct in
 * the UI fixes mis-buckets. Pure (no service/state deps) so it's unit-testable.
 */
import type { Requirement, StudentRecord } from '../../types/degree';
import type { Course, Department } from '../../types/types';
import type { SelectedCourse } from '../../types/schedule';
import { academicYearForPeriod } from './catalogLookup';

export interface ScheduleMatchEntry {
  courseId: string;
  code: string; // "CS 3013"
  title: string;
  credits: number;
  confidence: 'exact' | 'heuristic';
}

/** requirement.rawName -> the schedule courses that (would) fill it. */
export type ScheduleMatch = Map<string, ScheduleMatchEntry[]>;

/**
 * A draggable tile on a requirement card. Two sources are draggable: `planned`
 * (in-progress courses from the imported record) and `schedule` (the active
 * schedule overlay). Each carries a stable `key` so drag re-bucketing can move
 * it independently, and an `originRawName` (its requirement before any move).
 */
export interface DegreeTile {
  key: string;
  kind: 'planned' | 'schedule';
  code: string;
  title: string;
  credits: number;
  term: string | null;
  /** Best-guess catalog academic year, for resolving the linked course. */
  year: number | null;
  confidence: ScheduleMatchEntry['confidence'] | 'manual' | null;
  moved: boolean;
  originRawName: string;
}

/** Catalog academic year encoded in a course id (`${dept}-${number}-${year}`), or null. */
function yearFromCourseId(courseId: string): number | null {
  const y = Number(courseId.slice(courseId.lastIndexOf('-') + 1));
  return Number.isFinite(y) ? y : null;
}

/**
 * Build the per-requirement draggable tiles from the imported record's planned
 * courses + the schedule overlay, applying manual drag re-bucketing
 * (`moves`: tile key → target requirement rawName). Pure, so the Degree state's
 * `placements` derived can be unit-tested without runes.
 */
export function computePlacements(
  record: StudentRecord | null,
  scheduleMatch: ScheduleMatch | null,
  moves: Record<string, string>,
): Map<string, DegreeTile[]> {
  const items: DegreeTile[] = [];

  if (record) {
    for (const req of record.requirements) {
      if (req.category === 'unused') continue;
      for (const c of req.appliedCourses) {
        if (!c.isInProgress) continue; // only "planned" tiles are draggable; completed/transfer stay fixed
        items.push({
          key: `planned:${c.code}:${c.period?.raw ?? ''}:${req.rawName}`,
          kind: 'planned',
          code: c.code,
          title: c.title,
          credits: c.credits,
          term: c.period?.raw ?? null,
          year: academicYearForPeriod(c.period),
          confidence: null,
          moved: false,
          originRawName: req.rawName,
        });
      }
    }
  }

  if (scheduleMatch) {
    for (const [rawName, entries] of scheduleMatch) {
      for (const e of entries) {
        items.push({
          key: `sched:${e.courseId}:${rawName}`,
          kind: 'schedule',
          code: e.code,
          title: e.title,
          credits: e.credits,
          term: null,
          year: yearFromCourseId(e.courseId),
          confidence: e.confidence,
          moved: false,
          originRawName: rawName,
        });
      }
    }
  }

  const out = new Map<string, DegreeTile[]>();
  for (const it of items) {
    const target = moves[it.key] ?? it.originRawName;
    const moved = target !== it.originRawName;
    const tile: DegreeTile = moved
      ? {
          ...it,
          moved: true,
          confidence: it.kind === 'schedule' ? 'manual' : it.confidence,
        }
      : it;
    const arr = out.get(target) ?? [];
    arr.push(tile);
    out.set(target, arr);
  }
  return out;
}

const codeOf = (course: Course): string =>
  `${course.departmentAbbr} ${course.number}`;

/** True if an applied-course code (possibly cross-listed "CS 2022/ MA 2201") equals `code`. */
function appliedCodeMatches(appliedCode: string, code: string): boolean {
  return appliedCode.split('/').some(part => part.trim() === code);
}

function reqListsCode(req: Requirement, code: string): boolean {
  return req.appliedCourses.some(ac => appliedCodeMatches(ac.code, code));
}

/**
 * Departments whose courses give credit toward a requirement, best-guess and
 * most-relevant first. Primary signal is the departments of courses Workday has
 * already applied; falls back to category rules when nothing is applied yet.
 * Returns `[]` for broad gen-ed / project buckets where no single department fits.
 */
export function inferRequirementDepartments(
  req: Requirement,
  departments: Department[],
): string[] {
  if (req.appliedCourses.length) {
    const counts = new Map<string, number>();
    for (const ac of req.appliedCourses) {
      const dept = ac.department?.trim();
      if (dept) counts.set(dept, (counts.get(dept) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([dept]) => dept);
  }

  switch (req.category) {
    case 'physical_education':
      return ['WPE'];
    case 'major_specific': {
      const name = req.scope?.trim().toLowerCase();
      const match = name
        ? departments.find(d => d.name.trim().toLowerCase() === name)
        : undefined;
      return match ? [match.abbreviation] : [];
    }
    default:
      return [];
  }
}

/** Rank for choosing among heuristic candidate requirements (lower = preferred). */
function categoryRank(req: Requirement): number {
  switch (req.category) {
    case 'major_specific':
    case 'physical_education':
      return 0;
    case 'free_electives':
      return 9;
    default:
      return 5;
  }
}

export function matchScheduleToRequirements(
  record: StudentRecord,
  selectedCourses: SelectedCourse[],
  departments: Department[],
): ScheduleMatch {
  const result: ScheduleMatch = new Map();
  const reqs = record.requirements.filter(r => r.category !== 'unused');

  const push = (rawName: string, entry: ScheduleMatchEntry) => {
    const arr = result.get(rawName) ?? [];
    arr.push(entry);
    result.set(rawName, arr);
  };

  for (const sc of selectedCourses) {
    const course = sc.course;
    const code = codeOf(course);
    const credits = course.minCredits;

    // Exact: the code is already listed under one or more requirements.
    const exact = reqs.filter(r => reqListsCode(r, code));
    if (exact.length) {
      for (const r of exact) {
        push(r.rawName, {
          courseId: course.id,
          code,
          title: course.name,
          credits,
          confidence: 'exact',
        });
      }
      continue;
    }

    // Heuristic: best unsatisfied requirement whose departments include this course's dept.
    const candidates = reqs
      .filter(
        r =>
          r.status !== 'satisfied' &&
          inferRequirementDepartments(r, departments).includes(
            course.departmentAbbr,
          ),
      )
      .sort((a, b) => categoryRank(a) - categoryRank(b));
    if (candidates.length) {
      push(candidates[0].rawName, {
        courseId: course.id,
        code,
        title: course.name,
        credits,
        confidence: 'heuristic',
      });
    }
  }

  return result;
}
