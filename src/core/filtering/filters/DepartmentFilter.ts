import { DepartmentFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';

export class DepartmentFilter implements SectionBasedFilter {
  readonly id = 'department';
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

  isValidCriteria(criteria: unknown): criteria is DepartmentFilterCriteria {
    return !!(
      criteria &&
      typeof criteria === 'object' &&
      'departments' in criteria &&
      Array.isArray((criteria as DepartmentFilterCriteria).departments) &&
      (criteria as DepartmentFilterCriteria).departments.every(
        (dept: unknown) => typeof dept === 'string',
      )
    );
  }

  getDisplayValue(criteria: DepartmentFilterCriteria): string {
    if (criteria.departments.length === 1) {
      return `Department: ${criteria.departments[0]}`;
    }
    return `Departments: ${criteria.departments.join(', ')}`;
  }
}
