/**
 * Courses a search lost through their labs and discussions alone. The
 * filters judge every section a student attends, so a lecture that fits
 * the times but whose every discussion falls in an avoided band is
 * dropped with them (SectionFilterPipeline.reconstructCourses), and the
 * student never sees the reason. This finds those lectures and says which
 * filter their companions failed.
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
import { courseCode } from './serialize';

/** The per-section filters a companion can fail, with what failing means. */
const COMPANION_FILTERS: {
  filter: SectionBasedFilter;
  reason: (criteria: unknown) => string;
}[] = [
  {
    filter: new TimesFilter(),
    reason: c =>
      (c as TimesFilterCriteria).mode === 'avoid'
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
  /** The filter id, as keyed in the query's filters. */
  filter: string;
  /** Codes of the courses dropped, each once. */
  courses: string[];
  /** "labs", "discussions" or "labs/discussions". */
  kinds: string;
  reason: string;
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
 * discussion) it needs failed that filter. `passed` is the pipeline's
 * output before reconstruction, `matches` the courses after it.
 */
export function companionDrops(
  passed: FilterableSection[],
  matches: Course[],
  criteria: Map<string, unknown>,
): Drop[] {
  const kept = new Set(matches.map(c => c.id));
  const byFilter = new Map<
    string,
    { courses: Set<string>; kinds: Set<string>; reason: string }
  >();

  for (const fs of passed) {
    if (fs.sectionType !== SectionType.LECTURE || !fs.lectureGroup) continue;
    if (kept.has(fs.course.id)) continue;
    for (const type of [SectionType.LAB, SectionType.DISCUSSION] as const) {
      const options = companionUnits(fs.course, fs.lectureGroup, type);
      if (!options.length) continue;
      for (const { filter, reason } of COMPANION_FILTERS) {
        const c = criteria.get(filter.id);
        if (c === undefined || !filter.isValidCriteria(c)) continue;
        if (filter.apply(options, c).length > 0) continue;
        let drop = byFilter.get(filter.id);
        if (!drop) {
          drop = { courses: new Set(), kinds: new Set(), reason: reason(c) };
          byFilter.set(filter.id, drop);
        }
        drop.courses.add(courseCode(fs.course));
        drop.kinds.add(type === SectionType.LAB ? 'labs' : 'discussions');
      }
    }
  }

  return [...byFilter].map(([filter, d]) => ({
    filter,
    courses: [...d.courses],
    kinds: [...d.kinds].sort().join('/'),
    reason: d.reason,
  }));
}

/** "2 courses dropped because their discussions fall in your avoided times: ES 3002, ES 2001." */
export function dropNotice(drop: Drop): string {
  const n = drop.courses.length;
  const named = drop.courses.slice(0, MAX_NAMED).join(', ');
  const more = n > MAX_NAMED ? ` +${n - MAX_NAMED} more` : '';
  return `${n === 1 ? '1 course' : `${n} courses`} dropped because ${n === 1 ? 'its' : 'their'} ${drop.kinds} ${drop.reason} (filters.${drop.filter}): ${named}${more}.`;
}
