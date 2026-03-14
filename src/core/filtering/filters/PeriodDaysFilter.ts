import { PeriodDaysFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';

export class PeriodDaysFilter implements SectionBasedFilter {
    readonly id = 'periodDays';
    readonly name = 'Period Days';
    readonly description = 'Exclude sections with classes on selected days';
    readonly priority = 20;

    apply(sections: FilterableSection[], criteria: PeriodDaysFilterCriteria): FilterableSection[] {
        if (!criteria.days || criteria.days.length === 0) {
            return sections;
        }

        const excludedDays = new Set(criteria.days.map(day => day.toLowerCase()));

        return sections.filter(fs => {
            return !fs.section.periods.some(period =>
                Array.from(period.days).some(day =>
                    excludedDays.has(day.toLowerCase())
                )
            );
        });
    }

    isValidCriteria(criteria: any): criteria is PeriodDaysFilterCriteria {
        return !!(criteria &&
                 typeof criteria === 'object' &&
                 'days' in criteria &&
                 Array.isArray(criteria.days) &&
                 criteria.days.every((day: any) => typeof day === 'string'));
    }

    getDisplayValue(criteria: PeriodDaysFilterCriteria): string {
        if (!criteria.days || criteria.days.length === 0) {
            return 'No exclusions';
        }

        if (criteria.days.length === 1) {
            return `Exclude: ${this.formatDayName(criteria.days[0])}`;
        }

        const dayNames = criteria.days.map(day => this.formatDayName(day));
        return `Exclude: ${dayNames.join(', ')}`;
    }

    private formatDayName(day: string): string {
        const dayMap: { [key: string]: string } = {
            'mon': 'Monday',
            'tue': 'Tuesday',
            'wed': 'Wednesday',
            'thu': 'Thursday',
            'fri': 'Friday',
            'sat': 'Saturday',
            'sun': 'Sunday'
        };

        return dayMap[day.toLowerCase()] || day;
    }
}
