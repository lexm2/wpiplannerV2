import { SelectedCourse } from '../../../types/schedule';
import { SelectedCourseFilter, GraduateLevelFilterCriteria } from '../../../types/filters';

export class GraduateLevelFilter implements SelectedCourseFilter {
    readonly id = 'graduateLevel';
    readonly name = 'Graduate Level';
    readonly description = 'Filter courses by graduate/undergraduate level';
    readonly priority = 80;

    apply(selectedCourses: any[], criteria: any, _activeFilters?: Map<string, any>): any[] {
        return this.applyToSelectedCourses(selectedCourses, criteria);
    }

    applyToSelectedCourses(selectedCourses: SelectedCourse[], criteria: GraduateLevelFilterCriteria): SelectedCourse[] {
        if (criteria.level === 'all') {
            return selectedCourses;
        }

        return selectedCourses.filter(sc => {
            const isGraduate = sc.course.isGraduate ?? false;

            if (criteria.level === 'graduate') {
                return isGraduate;
            } else if (criteria.level === 'undergraduate') {
                return !isGraduate;
            }

            return true;
        });
    }

    isValidCriteria(criteria: any): criteria is GraduateLevelFilterCriteria {
        return criteria &&
               typeof criteria === 'object' &&
               'level' in criteria &&
               ['all', 'undergraduate', 'graduate'].includes(criteria.level);
    }

    getDisplayValue(criteria: GraduateLevelFilterCriteria): string {
        switch (criteria.level) {
            case 'graduate': return 'Graduate Only';
            case 'undergraduate': return 'Undergraduate Only';
            case 'all': return 'All Levels';
            default: return 'Unknown Level';
        }
    }
}
