/**
 * The Degree page's course index: every course the page knows about, and which
 * bucket (or buckets) it sits in.
 *
 * Pure - no runes, no service deps - so the grouping rules are unit-testable
 * without mounting anything. The Degree page derives this from the same
 * buckets/placements/unassigned it already computes; nothing here re-reads
 * storage or the catalog.
 *
 * A course can legitimately count toward more than one requirement (Workday
 * applies CS 3013 to both Core and Systems, say), so entries carry a LIST of
 * buckets rather than one. Grouping by bucket then shows it under each.
 */
import type { AppliedCourse } from '../../types/degree';
import type { DegreeBucket, DegreeTile } from './degreeBuckets';
import { UMBRELLA_CATEGORIES } from './degreeBuckets';
import { academicYearForPeriod } from './catalogLookup';

/** Where the page learned about a course. */
type CourseSource = 'completed' | 'transfer' | 'planned' | 'schedule';

interface CourseBucketRef {
  id: string;
  name: string;
}

export interface CourseIndexEntry {
  key: string;
  code: string;
  title: string;
  credits: number;
  source: CourseSource;
  /** Empty for a schedule course not yet placed. */
  buckets: CourseBucketRef[];
  /** Catalog course id - present for schedule courses, which are movable. */
  courseId: string | null;
  grade: string | null;
  term: string | null;
  /** Best-guess catalog academic year, for opening the course. */
  year: number | null;
}

export type CourseSort = 'source' | 'bucket' | 'code' | 'term';

/**
 * The cycle order of the sort button. Source leads because it answers the
 * question the panel exists for - "where did this course come from, and did it
 * land anywhere?" - without the reader picking a mode first.
 */
export const COURSE_SORTS: { key: CourseSort; label: string }[] = [
  { key: 'source', label: 'By source' },
  { key: 'bucket', label: 'By bucket' },
  { key: 'code', label: 'By code' },
  { key: 'term', label: 'By term' },
];

export function nextSort(current: CourseSort): CourseSort {
  const i = COURSE_SORTS.findIndex(s => s.key === current);
  return COURSE_SORTS[(i + 1) % COURSE_SORTS.length].key;
}

const SOURCE_LABELS: Record<CourseSource, string> = {
  completed: 'Completed',
  transfer: 'Transfer',
  planned: 'Planned',
  schedule: 'In your schedule',
};

const SOURCE_ORDER: CourseSource[] = [
  'schedule',
  'planned',
  'completed',
  'transfer',
];

export const UNPLACED_LABEL = 'Not in a bucket';

/** Department-then-number, so CS 2011 sorts before CS 10101 and after CS 1101. */
function compareCodes(a: string, b: string): number {
  const [ad = '', an = ''] = a.split(/\s+/);
  const [bd = '', bn = ''] = b.split(/\s+/);
  if (ad !== bd) return ad.localeCompare(bd);
  const na = Number.parseInt(an, 10);
  const nb = Number.parseInt(bn, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return an.localeCompare(bn);
}

function sourceOf(course: AppliedCourse): CourseSource {
  if (course.isTransfer) return 'transfer';
  return course.isInProgress ? 'planned' : 'completed';
}

/**
 * One entry per (source, code). Buckets accumulate onto the existing entry, so
 * a cross-listed or doubly-applied course stays a single row carrying both.
 */
export function buildCourseIndex(
  buckets: DegreeBucket[],
  placements: Map<string, DegreeTile[]>,
  unassigned: DegreeTile[],
): CourseIndexEntry[] {
  const byKey = new Map<string, CourseIndexEntry>();

  const add = (
    entry: Omit<CourseIndexEntry, 'key' | 'buckets'>,
    bucket: CourseBucketRef | null,
  ): void => {
    const key = `${entry.source}:${entry.code}`;
    const existing = byKey.get(key);
    if (existing) {
      if (bucket && !existing.buckets.some(b => b.id === bucket.id))
        existing.buckets.push(bucket);
      return;
    }
    byKey.set(key, { ...entry, key, buckets: bucket ? [bucket] : [] });
  };

  for (const bucket of buckets) {
    const ref: CourseBucketRef = { id: bucket.id, name: bucket.name };

    // Workday's fixed transcript courses.
    for (const c of bucket.appliedCourses) {
      if (c.isInProgress) continue; // those arrive as placement tiles instead
      add(
        {
          code: c.code,
          title: c.title,
          credits: c.credits,
          source: sourceOf(c),
          courseId: null,
          grade: c.grade,
          term: c.period?.raw ?? null,
          year: academicYearForPeriod(c.period),
        },
        ref,
      );
    }

    // Planned (in-progress) and user-placed schedule courses.
    for (const tile of placements.get(bucket.id) ?? []) {
      add(
        {
          code: tile.code,
          title: tile.title,
          credits: tile.credits,
          source: tile.kind === 'planned' ? 'planned' : 'schedule',
          courseId: tile.courseId,
          grade: null,
          term: tile.term,
          year: tile.year,
        },
        ref,
      );
    }
  }

  for (const tile of unassigned) {
    add(
      {
        code: tile.code,
        title: tile.title,
        credits: tile.credits,
        source: 'schedule',
        courseId: tile.courseId,
        grade: null,
        term: tile.term,
        year: tile.year,
      },
      null,
    );
  }

  return [...byKey.values()].sort((a, b) => compareCodes(a.code, b.code));
}

/** Case-insensitive match on code, title, or the name of a bucket it is in. */
export function matchesQuery(entry: CourseIndexEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    entry.code.toLowerCase().includes(q) ||
    entry.title.toLowerCase().includes(q) ||
    entry.buckets.some(b => b.name.toLowerCase().includes(q))
  );
}

export interface CourseGroup {
  key: string;
  label: string;
  entries: CourseIndexEntry[];
}

/**
 * Sections for the chosen mode, empty ones dropped.
 *
 * `bucket` is the one mode that repeats an entry: a course applied to two
 * requirements belongs under both, and hiding it from one would misreport that
 * bucket's contents.
 */
export function groupCourses(
  entries: CourseIndexEntry[],
  mode: CourseSort,
  buckets: DegreeBucket[],
): CourseGroup[] {
  if (mode === 'code') {
    return entries.length
      ? [{ key: 'all', label: 'All courses', entries }]
      : [];
  }

  if (mode === 'source') {
    return SOURCE_ORDER.map(source => ({
      key: source,
      label: SOURCE_LABELS[source],
      entries: entries.filter(e => e.source === source),
    })).filter(g => g.entries.length > 0);
  }

  if (mode === 'term') {
    const terms = [
      ...new Set(entries.map(e => e.term).filter((t): t is string => !!t)),
    ].sort();
    const groups: CourseGroup[] = terms.map(term => ({
      key: term,
      label: term,
      entries: entries.filter(e => e.term === term),
    }));
    const undated = entries.filter(e => !e.term);
    if (undated.length)
      groups.push({ key: '-none', label: 'No term', entries: undated });
    return groups;
  }

  // mode === 'bucket' - bucket display order, but degree-wide aggregates after
  // the real requirements (they hold every course, and would otherwise bury
  // them), and unplaced schedule courses last of all.
  const named: CourseGroup[] = [];
  const umbrella: CourseGroup[] = [];
  for (const bucket of buckets) {
    const group = {
      key: bucket.id,
      label: bucket.name,
      entries: entries.filter(e => e.buckets.some(b => b.id === bucket.id)),
    };
    if (!group.entries.length) continue;
    (UMBRELLA_CATEGORIES.has(bucket.category) ? umbrella : named).push(group);
  }
  const groups: CourseGroup[] = [...named, ...umbrella];

  const unplaced = entries.filter(e => e.buckets.length === 0);
  if (unplaced.length)
    groups.push({ key: '-unplaced', label: UNPLACED_LABEL, entries: unplaced });
  return groups;
}
