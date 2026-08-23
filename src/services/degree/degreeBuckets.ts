/**
 * The Degree page's bucket model: what buckets exist, and which courses sit in
 * each one. Pure (no service/state deps) so it is unit-testable without runes.
 *
 * Buckets come from the Workday export, one per requirement row, normalised to
 * a DegreeBucket keyed `req:<rawName>`.
 *
 * Placement is manual: Workday owns where its own transcript courses go, while
 * schedule courses start unassigned and move only because the user placed them.
 */
import type {
  AppliedCourse,
  DegreeBucketConfig,
  Requirement,
  RequirementCategory,
  RequirementStatus,
  StudentRecord,
} from '../../types/degree';
import { importedBucketId } from '../../types/degree';
import type { Course, Department } from '../../types/types';
import type { SelectedCourse } from '../../types/schedule';
import { academicYearForPeriod } from './catalogLookup';

/** A bucket as the UI renders it. */
export interface DegreeBucket {
  id: string;
  source: 'import';
  name: string;
  scope: string;
  category: RequirementCategory;
  status: RequirementStatus;
  creditsRequired: number | null;
  coursesRemaining: number | null;
  appliedCourses: AppliedCourse[];
}

/**
 * A course tile on a bucket. `planned` tiles are Workday's in-progress courses,
 * fixed where the export put them; `schedule` tiles are user-assigned.
 */
export interface DegreeTile {
  key: string;
  kind: 'planned' | 'schedule';
  /** Catalog course id - the assignment key. null for planned tiles. */
  courseId: string | null;
  code: string;
  title: string;
  credits: number;
  term: string | null;
  /** Best-guess catalog academic year, for resolving the linked course. */
  year: number | null;
}

/** Catalog academic year encoded in a course id (`${dept}-${number}-${year}`), or null. */
function yearFromCourseId(courseId: string): number | null {
  const y = Number(courseId.slice(courseId.lastIndexOf('-') + 1));
  return Number.isFinite(y) ? y : null;
}

const codeOf = (course: Course): string =>
  `${course.departmentAbbr} ${course.number}`;

/** True if an applied-course code (possibly cross-listed "CS 2022/ MA 2201") equals `code`. */
function appliedCodeMatches(appliedCode: string, code: string): boolean {
  return appliedCode.split('/').some(part => part.trim() === code);
}

/**
 * Every bucket to render: the record's requirements, minus the synthetic
 * "unused" one, in the order the Workday sheet listed them.
 */
export function buildBuckets(
  record: StudentRecord | null,
  _config: DegreeBucketConfig,
): DegreeBucket[] {
  if (!record) return [];
  return record.requirements
    .filter(req => req.category !== 'unused')
    .map(req => fromRequirement(importedBucketId(req.rawName), req));
}

function fromRequirement(id: string, req: Requirement): DegreeBucket {
  return {
    id,
    source: 'import' as const,
    name: req.name,
    scope: req.scope,
    category: req.category,
    status: req.status,
    creditsRequired: req.creditsRequired,
    coursesRemaining: req.coursesRemaining,
    appliedCourses: req.appliedCourses,
  };
}

/**
 * Tiles per bucket id: Workday's in-progress courses plus the schedule courses
 * assigned to that bucket. An assignment naming a bucket that no longer exists
 * is skipped, so the course falls back to the rail rather than vanishing.
 */
export function computePlacements(
  buckets: DegreeBucket[],
  selectedCourses: SelectedCourse[],
  assignments: Record<string, string>,
): Map<string, DegreeTile[]> {
  const out = new Map<string, DegreeTile[]>();
  const known = new Set(buckets.map(b => b.id));

  const push = (bucketId: string, tile: DegreeTile) => {
    const arr = out.get(bucketId) ?? [];
    arr.push(tile);
    out.set(bucketId, arr);
  };

  for (const bucket of buckets) {
    for (const c of bucket.appliedCourses) {
      if (!c.isInProgress) continue; // completed/transfer render as fixed courses
      push(bucket.id, {
        key: `planned:${c.code}:${c.period?.raw ?? ''}:${bucket.id}`,
        kind: 'planned',
        courseId: null,
        code: c.code,
        title: c.title,
        credits: c.credits,
        term: c.period?.raw ?? null,
        year: academicYearForPeriod(c.period),
      });
    }
  }

  for (const sc of selectedCourses) {
    const bucketId = assignments[sc.course.id];
    if (!bucketId || !known.has(bucketId)) continue;
    push(bucketId, scheduleTile(sc.course, bucketId));
  }

  return out;
}

function scheduleTile(course: Course, bucketId: string): DegreeTile {
  return {
    key: `sched:${course.id}:${bucketId}`,
    kind: 'schedule',
    courseId: course.id,
    code: codeOf(course),
    title: course.name,
    credits: course.minCredits,
    term: null,
    year: yearFromCourseId(course.id),
  };
}

/**
 * Schedule courses still waiting to be placed. Courses already on the
 * transcript are left out - Workday has applied them, so offering them for
 * assignment would count them twice.
 */
export function computeUnassigned(
  record: StudentRecord | null,
  selectedCourses: SelectedCourse[],
  assignments: Record<string, string>,
): DegreeTile[] {
  const transcriptCodes = record?.courses.map(c => c.code) ?? [];

  return selectedCourses
    .filter(sc => {
      if (assignments[sc.course.id]) return false;
      const code = codeOf(sc.course);
      return !transcriptCodes.some(tc => appliedCodeMatches(tc, code));
    })
    .map(sc => scheduleTile(sc.course, ''));
}

/**
 * Departments whose courses give credit toward a bucket, most-relevant first.
 * Inferred from the courses Workday applied, falling back to category rules.
 * Returns `[]` for broad gen-ed / project buckets where no one department fits.
 */
export function inferBucketDepartments(
  bucket: DegreeBucket,
  departments: Department[],
): string[] {
  if (bucket.appliedCourses.length) {
    const counts = new Map<string, number>();
    for (const ac of bucket.appliedCourses) {
      const dept = ac.department?.trim();
      if (dept) counts.set(dept, (counts.get(dept) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([dept]) => dept);
  }

  switch (bucket.category) {
    case 'physical_education':
      return ['WPE'];
    case 'major_specific': {
      const name = bucket.scope?.trim().toLowerCase();
      const match = name
        ? departments.find(d => d.name.trim().toLowerCase() === name)
        : undefined;
      return match ? [match.abbreviation] : [];
    }
    default:
      return [];
  }
}
