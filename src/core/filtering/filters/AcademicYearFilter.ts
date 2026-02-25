import { SelectedCourse } from '../../../types/schedule';
import { SelectedCourseFilter, AcademicYearFilterCriteria } from '../../../types/filters';

export class AcademicYearFilter implements SelectedCourseFilter {
    readonly id = 'academicYear';
    readonly name = 'Academic Year';
    readonly description = 'Filter courses by academic year';
    readonly priority = 75;

    apply(selectedCourses: any[], criteria: any): any[] {
        return this.applyToSelectedCourses(selectedCourses, criteria);
    }

    applyToSelectedCourses(selectedCourses: SelectedCourse[], criteria: AcademicYearFilterCriteria): SelectedCourse[] {
        if (criteria.year === 'all') return selectedCourses;
        return selectedCourses.filter(sc => sc.course.academicYear === criteria.year);
    }

    isValidCriteria(criteria: any): criteria is AcademicYearFilterCriteria {
        return criteria && typeof criteria === 'object' && 'year' in criteria;
    }

    getDisplayValue(criteria: AcademicYearFilterCriteria): string {
        return criteria.year === 'all' ? 'All Years' : `${criteria.year}–${Number(criteria.year) + 1}`;
    }
}
