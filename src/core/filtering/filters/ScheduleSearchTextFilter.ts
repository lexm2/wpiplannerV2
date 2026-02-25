import { Section } from '../../../types/types';
import { SectionFilter, SearchTextFilterCriteria } from '../../../types/filters';
import { SelectedCourse } from '../../../types/schedule';

/**
 * Search text filter for ScheduleFilterService
 * Searches across course names, numbers, departments, section numbers, and professor names
 */
export class ScheduleSearchTextFilter implements SectionFilter<SearchTextFilterCriteria> {
    readonly id = 'searchText';
    readonly name = 'Search Text';
    readonly description = 'Search for courses, sections, or professors';
    readonly priority = 1;

    apply(sections: Section[], criteria: SearchTextFilterCriteria, _activeFilters?: Map<string, unknown>): Section[] {
        return this.applyToSections(sections, criteria);
    }

    applyToSections(sections: Section[], criteria: SearchTextFilterCriteria): Section[] {
        if (!criteria.query || !criteria.query.trim()) {
            return sections;
        }

        const query = criteria.query.toLowerCase().trim();

        return sections.filter(section => {
            // Search in section number
            if (section.number.toLowerCase().includes(query)) {
                return true;
            }

            // Search in any period info within the section
            return section.periods.some(period =>
                period.professor.toLowerCase().includes(query) ||
                period.type.toLowerCase().includes(query) ||
                period.building.toLowerCase().includes(query) ||
                period.room.toLowerCase().includes(query) ||
                period.location.toLowerCase().includes(query)
            );
        });
    }

    applyToSectionsWithContext(sectionsWithContext: Array<{course: SelectedCourse, section: Section}>, criteria: SearchTextFilterCriteria): Array<{course: SelectedCourse, section: Section}> {
        if (!criteria.query || !criteria.query.trim()) {
            return sectionsWithContext;
        }

        const query = criteria.query.toLowerCase().trim();

        return sectionsWithContext.filter(item => {
            const course = item.course.course;
            const section = item.section;

            // Search in course info
            if (course.name.toLowerCase().includes(query) ||
                course.number.toLowerCase().includes(query) ||
                course.departmentAbbr.toLowerCase().includes(query)) {
                return true;
            }

            // Search in section number
            if (section.number.toLowerCase().includes(query)) {
                return true;
            }

            // Search in any period info within the section
            return section.periods.some(period =>
                period.professor.toLowerCase().includes(query) ||
                period.type.toLowerCase().includes(query) ||
                period.building.toLowerCase().includes(query) ||
                period.room.toLowerCase().includes(query) ||
                period.location.toLowerCase().includes(query)
            );
        });
    }

    isValidCriteria(criteria: unknown): criteria is SearchTextFilterCriteria {
        if (!criteria || typeof criteria !== 'object') {
            return false;
        }
        const c = criteria as SearchTextFilterCriteria;
        return 'query' in c && typeof c.query === 'string';
    }

    getDisplayValue(criteria: SearchTextFilterCriteria): string {
        const query = criteria.query?.trim() || '';
        if (query.length === 0) {
            return 'No search text';
        }
        return `Search: "${query}"`;
    }
}
