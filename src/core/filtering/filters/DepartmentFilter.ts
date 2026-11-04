import {
  DepartmentFilterCriteriaSchema,
  type DepartmentFilterCriteria,
} from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';

export class DepartmentFilter implements SectionBasedFilter {
  static readonly id = 'department';
  static readonly criteria = DepartmentFilterCriteriaSchema;
  readonly id = DepartmentFilter.id;
  readonly criteria = DepartmentFilter.criteria;
  readonly name = 'Department';
  readonly description = 'Filter courses by department(s)';
  readonly priority = 25;

  apply(
    sections: FilterableSection[],
    criteria: DepartmentFilterCriteria,
  ): FilterableSection[] {
    if (!criteria.departments || criteria.departments.length === 0) {
      return sections;
    }

    const departmentSet = new Set(
      criteria.departments.map(dept => dept.toLowerCase()),
    );

    return sections.filter(fs =>
      departmentSet.has(fs.course.departmentAbbr.toLowerCase()),
    );
  }

  getDisplayValue(criteria: DepartmentFilterCriteria): string {
    if (criteria.departments.length === 1) {
      return `Department: ${criteria.departments[0]}`;
    }
    return `Departments: ${criteria.departments.join(', ')}`;
  }
}
