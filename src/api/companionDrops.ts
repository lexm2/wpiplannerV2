/**
 * Courses a search lost through their labs and discussions alone. The
 * filters judge every section a student attends, so a lecture that fits
 * the times but whose every discussion falls in an avoided band is
 * dropped with them (SectionFilterPipeline.reconstructCourses), and the
 * student never sees the reason. This finds those lectures and says which
 * filter their companions failed, or that each failed a different one.
 */
import type { FilterableSection } from '../types/filterableUnit';
import type { Course, LectureGroup, Section } from '../types/types';
import { SectionType } from '../types/types';
import type { TimesFilterCriteria } from '../types/filters';
import type { SectionBasedFilter } from '../core/filtering/SectionFilterPipeline';
import { AvailabilityFilter } from '../core/filtering/filters/AvailabilityFilter';
import { ConflictFilter } from '../core/filtering/filters/ConflictFilter';
import { DeliveryModeFilter } from '../core/filtering/filters/DeliveryModeFilter';
import { TimesFilter } from '../core/filtering/filters/TimesFilter';
import { timedPeriods } from '../utils/timeWindows';
import { courseCode } from './serialize';

/** The per-section filters a companion can fail, with what failing means. */
const COMPANION_FILTERS: {
  filter: SectionBasedFilter;
  /** What the companions that failed have in common, given the criteria. */
  reason: (criteria: unknown, failed: Section[]) => string;
}[] = [
  {
    filter: new TimesFilter(),
    reason: (c, failed) =>
      // An async lab has no time to fall in or out of a band: it failed
      // for having none.
      failed.every(s => timedPeriods(s).length === 0)
        ? 'have no set meeting times (filters.times.includeAsync: true keeps them)'
        : (c as TimesFilterCriteria).mode === 'avoid'
          ? 'fall in your avoided times'
          : 'fall outside your times',
  },
  {
    filter: new AvailabilityFilter(),
    reason: () => 'lack the seats asked for',
  },
  { filter: new ConflictFilter(), reason: () => 'clash with your CRNs' },
  {
    filter: new DeliveryModeFilter(),
    reason: () => 'are not in the delivery modes asked for',
  },
];

/** Whether the criteria hold a filter a companion alone can fail. */
export const judgesCompanions = (criteria: Map<string, unknown>) =>
  COMPANION_FILTERS.some(({ filter }) => criteria.has(filter.id));

/** Courses named in a drop notice before "+N more". */
const MAX_NAMED = 5;

interface Drop {
  /**
   * The filter ids, as keyed in the query's filters: one that every lab
   * (or discussion) failed, or several when each failed a different one.
   */
  filters: string[];
  /** Codes of the courses dropped, each once. */
  courses: string[];
  /** "labs", "discussions" or "labs/discussions". */
  kinds: string;
  /** Null when no single filter is to blame. */
  reason: string | null;
}

function companionUnits(
  course: Course,
  group: LectureGroup,
  type: SectionType.LAB | SectionType.DISCUSSION,
): FilterableSection[] {
  const sections: Section[] =
    type === SectionType.LAB
      ? group.compatibleLabs
      : group.compatibleDiscussions;
  return sections.map(section => ({
    course,
    section,
    lectureGroup: group,
    sectionType: type,
  }));
}

/**
 * For each per-section filter given, the courses none of whose lectures
 * survived, though some lecture passed every filter itself: every lab (or
 * discussion) it needs failed that filter. A lecture whose labs each fail
 * a different filter (DX01 the conflict, DX02 the seats) is a drop of its
 * own, naming the filters together. `passed` is the pipeline's output
 * before reconstruction, `matches` the courses after it.
 */
export function companionDrops(
  passed: FilterableSection[],
  matches: Course[],
  criteria: Map<string, unknown>,
): Drop[] {
  const kept = new Set(matches.map(c => c.id));
  const active = COMPANION_FILTERS.flatMap(entry => {
    const c = criteria.get(entry.filter.id);
    return c !== undefined && entry.filter.isValidCriteria(c)
      ? [{ ...entry, criteria: c }]
      : [];
  });
  const drops = new Map<
    string,
    {
      filters: string[];
      courses: Set<string>;
      kinds: Set<string>;
      reason: string | null;
    }
  >();
  const record = (
    filters: string[],
    reason: string | null,
    course: Course,
    type: SectionType,
  ) => {
    const key = filters.join('+');
    let drop = drops.get(key);
    if (!drop) {
      drop = { filters, courses: new Set(), kinds: new Set(), reason };
      drops.set(key, drop);
    }
    drop.courses.add(courseCode(course));
    drop.kinds.add(type === SectionType.LAB ? 'labs' : 'discussions');
  };

  for (const fs of passed) {
    if (fs.sectionType !== SectionType.LECTURE || !fs.lectureGroup) continue;
    if (kept.has(fs.course.id)) continue;
    for (const type of [SectionType.LAB, SectionType.DISCUSSION] as const) {
      const options = companionUnits(fs.course, fs.lectureGroup, type);
      if (!options.length) continue;
      let blamed = false;
      for (const { filter, criteria: c, reason } of active) {
        if (filter.apply(options, c).length > 0) continue;
        blamed = true;
        record(
          [filter.id],
          reason(
            c,
            options.map(o => o.section),
          ),
          fs.course,
          type,
        );
      }
      if (blamed) continue;
      // No one filter empties the list, yet none passes them all.
      let left = options;
      const failedOn: string[] = [];
      for (const { filter, criteria: c } of active) {
        const next = filter.apply(left, c);
        if (next.length < left.length) failedOn.push(filter.id);
        left = next;
      }
      if (left.length === 0) record(failedOn, null, fs.course, type);
    }
  }

  return [...drops.values()].map(d => ({
    filters: d.filters,
    courses: [...d.courses],
    kinds: [...d.kinds].sort().join('/'),
    reason: d.reason,
  }));
}

/**
 * "2 courses dropped because their discussions fall in your avoided
 * times (filters.times): ES 3002, ES 2001.", or, when each lab failed a
 * different filter, "1 course dropped because none of its labs passes
 * all of these filters together (filters.availability,
 * filters.periodConflict): ECE 3849."
 */
export function dropNotice(drop: Drop): string {
  const n = drop.courses.length;
  const named = drop.courses.slice(0, MAX_NAMED).join(', ');
  const more = n > MAX_NAMED ? ` +${n - MAX_NAMED} more` : '';
  const its = n === 1 ? 'its' : 'their';
  const which = drop.filters.map(f => `filters.${f}`).join(', ');
  const why = drop.reason
    ? `${its} ${drop.kinds} ${drop.reason}`
    : `none of ${its} ${drop.kinds} passes all of these filters together`;
  return `${n === 1 ? '1 course' : `${n} courses`} dropped because ${why} (${which}): ${named}${more}.`;
}
