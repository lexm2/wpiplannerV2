import { DayOfWeek } from '../../../types/types';
import type { TimesFilterCriteria, TimeWindow } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';
import {
  describeWindows,
  isAsyncSection,
  periodInsideWindows,
  periodOverlapsWindows,
  timedPeriods,
  windowsByDay,
} from '../../../utils/timeWindows';

const VALID_DAYS = new Set<string>(Object.values(DayOfWeek));

/**
 * Restricts courses by when they meet, using the weekly grid painted in the
 * Times modal.
 *
 * `only` keeps a section when every timed period fits entirely inside the
 * painted region; `avoid` drops a section when any timed period overlaps it.
 * The two are mirror images: a section passes `only` exactly when none of its
 * meetings fall outside the selection.
 *
 * A section with nothing on the grid (async) has no meetings to test, so it
 * is kept only when the criteria ask for it with `includeAsync`.
 */
export class TimesFilter implements SectionBasedFilter {
  readonly id = 'times';
  readonly name = 'Times';
  readonly description = 'Show only courses that meet during selected times';
  readonly priority = 15;

  apply(
    sections: FilterableSection[],
    criteria: TimesFilterCriteria,
  ): FilterableSection[] {
    if (!criteria?.windows?.length) {
      return sections;
    }

    const byDay = windowsByDay(criteria.windows);
    const whitelist = criteria.mode === 'only';

    return sections.filter(fs => {
      if (isAsyncSection(fs.section)) return criteria.includeAsync === true;
      const periods = timedPeriods(fs.section);

      return whitelist
        ? periods.every(p => periodInsideWindows(p, byDay))
        : !periods.some(p => periodOverlapsWindows(p, byDay));
    });
  }

  isValidCriteria(criteria: unknown): criteria is TimesFilterCriteria {
    if (!criteria || typeof criteria !== 'object') return false;
    const c = criteria as Record<string, unknown>;

    if (c.mode !== 'only' && c.mode !== 'avoid') return false;
    if (!Array.isArray(c.windows)) return false;
    if (c.includeAsync !== undefined && typeof c.includeAsync !== 'boolean')
      return false;

    // An empty window list is valid - it is the cleared state.
    return c.windows.every(w => {
      if (!w || typeof w !== 'object') return false;
      const t = w as TimeWindow;
      return (
        VALID_DAYS.has(t.day) &&
        Number.isFinite(t.startMin) &&
        Number.isFinite(t.endMin) &&
        t.startMin < t.endMin
      );
    });
  }

  getDisplayValue(criteria: TimesFilterCriteria): string {
    const times = describeWindows(
      criteria?.windows ?? [],
      criteria?.mode ?? 'only',
    );
    return criteria?.includeAsync ? `${times} • async included` : times;
  }
}
