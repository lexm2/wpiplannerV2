import { AcademicYearFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';

export class AcademicYearFilter implements SectionBasedFilter {
    readonly id = 'academicYear';
    readonly name = 'Academic Year';
    readonly description = 'Filter courses by academic year';
    readonly priority = 75;

    apply(sections: FilterableSection[], criteria: AcademicYearFilterCriteria): FilterableSection[] {
        if (criteria.year === 'all') return sections;
        return sections.filter(fs => fs.course.academicYear === criteria.year);
    }

    isValidCriteria(criteria: unknown): criteria is AcademicYearFilterCriteria {
        if (!criteria || typeof criteria !== 'object' || !('year' in criteria)) return false;
        const c = criteria as Record<string, unknown>;
        return c.year === 'all' || typeof c.year === 'number';
    }

    getDisplayValue(criteria: AcademicYearFilterCriteria): string {
        return criteria.year === 'all' ? 'All Years' : `${criteria.year}-${Number(criteria.year) + 1}`;
    }
}
