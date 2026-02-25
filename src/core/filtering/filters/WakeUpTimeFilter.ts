import { Section, SimpleTime } from '../../../types/types';
import { SectionFilter } from '../../../types/filters';
import { SelectedCourse } from '../../../types/schedule';

export interface WakeUpTimeFilterCriteria {
    wakeUpTime: SimpleTime;
}

export class WakeUpTimeFilter implements SectionFilter<WakeUpTimeFilterCriteria> {
    readonly id = 'wakeUpTime';
    readonly name = 'Wake-Up Time';
    readonly description = 'Exclude sections with classes before specified wake-up time';
    readonly priority = 15;

    apply(sections: Section[], criteria: WakeUpTimeFilterCriteria): Section[] {
        return this.applyToSections(sections, criteria);
    }

    applyToSections(sections: Section[], criteria: WakeUpTimeFilterCriteria): Section[] {
        if (!criteria.wakeUpTime) {
            return sections;
        }

        const wakeUpMinutes = criteria.wakeUpTime.hours * 60 + criteria.wakeUpTime.minutes;

        return sections.filter(section => {
            if (!section.periods || section.periods.length === 0) {
                return true;
            }

            for (const period of section.periods) {
                if (period.isAsync) {
                    continue;
                }

                const periodStartMinutes = period.startTime.hours * 60 + period.startTime.minutes;

                if (periodStartMinutes < wakeUpMinutes) {
                    return false;
                }
            }

            return true;
        });
    }

    applyToSectionsWithContext(
        sectionsWithContext: Array<{ course: SelectedCourse; section: Section }>,
        criteria: WakeUpTimeFilterCriteria
    ): Array<{ course: SelectedCourse; section: Section }> {
        if (!criteria.wakeUpTime) {
            return sectionsWithContext;
        }

        const wakeUpMinutes = criteria.wakeUpTime.hours * 60 + criteria.wakeUpTime.minutes;

        return sectionsWithContext.filter(item => {
            if (!item.section.periods || item.section.periods.length === 0) {
                return true;
            }

            for (const period of item.section.periods) {
                if (period.isAsync) {
                    continue;
                }

                const periodStartMinutes = period.startTime.hours * 60 + period.startTime.minutes;

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
