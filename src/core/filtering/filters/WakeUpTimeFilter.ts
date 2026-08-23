import { SimpleTime } from '../../../types/types';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';

export interface WakeUpTimeFilterCriteria {
  wakeUpTime: SimpleTime;
}

export class WakeUpTimeFilter implements SectionBasedFilter {
  readonly id = 'wakeUpTime';
  readonly name = 'Wake-Up Time';
  readonly description =
    'Exclude sections with classes before specified wake-up time';
  readonly priority = 15;

  apply(
    sections: FilterableSection[],
    criteria: WakeUpTimeFilterCriteria,
  ): FilterableSection[] {
    if (!criteria.wakeUpTime) {
      return sections;
    }

    const wakeUpMinutes =
      criteria.wakeUpTime.hours * 60 + criteria.wakeUpTime.minutes;

    return sections.filter(fs => {
      if (!fs.section.periods || fs.section.periods.length === 0) {
        return true;
      }

      for (const period of fs.section.periods) {
        if (period.isAsync) {
          continue;
        }

        const periodStartMinutes =
          period.startTime.hours * 60 + period.startTime.minutes;

        if (periodStartMinutes < wakeUpMinutes) {
          return false;
        }
      }

      return true;
    });
  }

  isValidCriteria(criteria: unknown): criteria is WakeUpTimeFilterCriteria {
    return !!(
      criteria &&
      typeof criteria === 'object' &&
      'wakeUpTime' in criteria &&
      (criteria as WakeUpTimeFilterCriteria).wakeUpTime &&
      typeof (criteria as WakeUpTimeFilterCriteria).wakeUpTime === 'object' &&
      'hours' in (criteria as WakeUpTimeFilterCriteria).wakeUpTime &&
      'minutes' in (criteria as WakeUpTimeFilterCriteria).wakeUpTime
    );
  }

  getDisplayValue(criteria: WakeUpTimeFilterCriteria): string {
    if (!criteria.wakeUpTime) {
      return 'No wake-up time set';
    }

    const hours = criteria.wakeUpTime.hours;
    const minutes = criteria.wakeUpTime.minutes;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');

    return `Classes after ${displayHours}:${displayMinutes} ${ampm}`;
  }
}
