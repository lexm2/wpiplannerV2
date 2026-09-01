import { DayOfWeek } from '../../../types/types';
import type { TimesFilterCriteria, TimeWindow } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';
import {
  describeWindows,
  periodInsideWindows,
  periodOverlapsWindows,
  timedPeriods,
  windowsByDay,
} from '../../../utils/timeWindows';

const VALID_DAYS = new Set<string>(Object.values(DayOfWeek));

/**
 * Restricts courses by when they meet, using the weekly grid the user paints in
 * the Times modal.
 *
 * Two modes, one predicate flipped:
 * - `only` (whitelist) keeps a section when at least one timed period fits
 *   entirely inside the painted region. This is the "find me something for the
 *   gap between my other classes" case.
 * - `avoid` (blacklist) drops a section when any timed period overlaps the
 *   painted region - the classic "no 8 AMs" case.
 *
 * Deliberately uses plain minute arithmetic rather than BitMaskEngine: that
 * engine's 7 AM-10 PM lattice yields an empty mask for out-of-range periods,
 * which would read as "contained" and silently pass the whitelist.
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
      const periods = timedPeriods(fs.section);

      // A section with nothing on the grid (async, or no meeting times at all)
      // imposes no schedule constraint, so neither mode has grounds to drop it.
      // Hiding a course's async lab would also strand its lecture group in the
      // component wizard.
      if (periods.length === 0) return true;

      return whitelist
        ? periods.some(p => periodInsideWindows(p, byDay))
        : !periods.some(p => periodOverlapsWindows(p, byDay));
    });
  }

  isValidCriteria(criteria: unknown): criteria is TimesFilterCriteria {
    if (!criteria || typeof criteria !== 'object') return false;
    const c = criteria as Record<string, unknown>;

    if (c.mode !== 'only' && c.mode !== 'avoid') return false;
    if (!Array.isArray(c.windows)) return false;

    // An empty window list is valid: the picker clears to it transiently, and
    // rejecting it would log a spurious "Invalid criteria" error.
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
    return describeWindows(criteria?.windows ?? [], criteria?.mode ?? 'only');
  }
}
