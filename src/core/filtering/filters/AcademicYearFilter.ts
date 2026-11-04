import {
  AcademicYearFilterCriteriaSchema,
  type AcademicYearFilterCriteria,
} from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';

export class AcademicYearFilter implements SectionBasedFilter {
  static readonly id = 'academicYear';
  static readonly criteria = AcademicYearFilterCriteriaSchema;
  readonly id = AcademicYearFilter.id;
  readonly criteria = AcademicYearFilter.criteria;
  readonly name = 'Academic Year';
  readonly description = 'Filter courses by academic year';
  readonly priority = 75;

  apply(
    sections: FilterableSection[],
    criteria: AcademicYearFilterCriteria,
  ): FilterableSection[] {
    if (criteria.year === 'all') return sections;
    return sections.filter(fs => fs.course.academicYear === criteria.year);
  }

  getDisplayValue(criteria: AcademicYearFilterCriteria): string {
    return criteria.year === 'all'
      ? 'All Years'
      : `${criteria.year}-${Number(criteria.year) + 1}`;
  }
}
