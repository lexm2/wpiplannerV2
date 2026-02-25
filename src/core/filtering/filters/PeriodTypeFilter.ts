import { Section } from '../../../types/types';
import { SectionFilter } from '../../../types/filters';
import { SelectedCourse } from '../../../types/schedule';

interface PeriodTypeFilterCriteria {
    types: string[];
}

export class PeriodTypeFilter implements SectionFilter {
    readonly id = 'periodType';
    readonly name = 'Period Type';
    readonly description = 'Exclude sections with the specified period types';
    readonly priority = 22;

    apply(sections: Section[], criteria: PeriodTypeFilterCriteria): Section[] {
        return this.applyToSections(sections, criteria);
    }

    applyToSections(sections: Section[], criteria: PeriodTypeFilterCriteria): Section[] {
        if (!criteria.types || criteria.types.length === 0) {
            return sections;
        }

        const excludedTypes = criteria.types.map(t => t.toLowerCase());

        return sections.filter(section =>
            !section.periods.some(period =>
                excludedTypes.some(excluded =>
                    period.type.toLowerCase().startsWith(excluded) ||
                    excluded.startsWith(period.type.toLowerCase())
                )
            )
        );
    }

    applyToSectionsWithContext(
        sectionsWithContext: Array<{ course: SelectedCourse; section: Section }>,
        criteria: PeriodTypeFilterCriteria
    ): Array<{ course: SelectedCourse; section: Section }> {
        if (!criteria.types || criteria.types.length === 0) {
            return sectionsWithContext;
        }

        const excludedTypes = criteria.types.map(t => t.toLowerCase());

        return sectionsWithContext.filter(item =>
            !item.section.periods.some(period =>
                excludedTypes.some(excluded =>
                    period.type.toLowerCase().startsWith(excluded) ||
                    excluded.startsWith(period.type.toLowerCase())
                )
            )
        );
    }

    isValidCriteria(criteria: any): criteria is PeriodTypeFilterCriteria {
        return !!(
            criteria &&
            typeof criteria === 'object' &&
            'types' in criteria &&
            Array.isArray(criteria.types) &&
            criteria.types.every((t: any) => typeof t === 'string')
        );
    }

    getDisplayValue(criteria: PeriodTypeFilterCriteria): string {
        if (!criteria.types || criteria.types.length === 0) {
            return 'No exclusions';
        }
        return `Exclude types: ${criteria.types.join(', ')}`;
    }
}
