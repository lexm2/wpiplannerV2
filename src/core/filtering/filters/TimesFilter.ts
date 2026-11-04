import {
  TimesFilterCriteriaSchema,
  type TimesFilterCriteria,
} from '../../../types/filters';
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

/**
 * Restricts courses by when they meet, using the weekly grid painted in the
 * Times modal.
 *
 * `only` keeps a section when every timed period fits entirely inside the
 * painted region; `avoid` drops a section when any timed period overlaps it.
 * The two are mirror images: a section passes `only` exactly when none of its
 * meetings fall outside the selection.
 *
 * A section with nothing on the grid (async, no set times) has no meetings
 * to test. Under `avoid` it overlaps nothing, so it always passes; under
 * `only` it is kept only when the criteria ask for it with `includeAsync`,
 * since painting the times to meet in says when classes should meet.
 */
export class TimesFilter implements SectionBasedFilter {
  static readonly id = 'times';
  static readonly criteria = TimesFilterCriteriaSchema;
  readonly id = TimesFilter.id;
  readonly criteria = TimesFilter.criteria;
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
      if (isAsyncSection(fs.section)) {
        return !whitelist || criteria.includeAsync === true;
      }
      const periods = timedPeriods(fs.section);

      return whitelist
        ? periods.every(p => periodInsideWindows(p, byDay))
        : !periods.some(p => periodOverlapsWindows(p, byDay));
    });
  }

  getDisplayValue(criteria: TimesFilterCriteria): string {
    const times = describeWindows(
      criteria?.windows ?? [],
      criteria?.mode ?? 'only',
    );
    // Avoiding times keeps async sections anyway, so saying so adds nothing.
    return criteria?.includeAsync && criteria.mode === 'only'
      ? `${times} • async included`
      : times;
  }
}
