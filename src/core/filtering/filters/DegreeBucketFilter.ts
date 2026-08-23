import { DegreeBucketFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';
import { candidateCodes } from '../../../services/degree/catalogLookup';

/**
 * Backend-only filter that restricts the course list to the departments eligible
 * for a degree-requirement bucket, minus any specifically-excluded course codes
 * (both derived from WPI program tracking sheets via src/constants/degreeBucketRules.ts).
 *
 * Registered like SearchTextFilter (no FilterPanel component), so it never appears
 * in the UI; it is applied programmatically from the Degree page when a requirement
 * bucket is focused. Empty criteria is a no-op pass-through.
 *
 * Priority 24 places it just before DepartmentFilter (25): same allowlist family,
 * but the coarser, system-imposed restriction, so it pre-filters first.
 */
export class DegreeBucketFilter implements SectionBasedFilter {
  readonly id = 'degreeBucket';
  readonly name = 'Degree Requirement';
  readonly description =
    'Restrict courses to those eligible for a degree requirement bucket';
  readonly priority = 24;

  apply(
    sections: FilterableSection[],
    criteria: DegreeBucketFilterCriteria,
  ): FilterableSection[] {
    const hasDeptRestriction = (criteria.allowedDepartments?.length ?? 0) > 0;
    const hasExclusions = (criteria.excludedCourses?.length ?? 0) > 0;
    if (!hasDeptRestriction && !hasExclusions) return sections;

    const allowed = new Set(
      criteria.allowedDepartments.map(d => d.toUpperCase()),
    );

    // Expand excluded codes via candidateCodes so cross-listed ("CS 2022/ MA 2201")
    // and unspaced ("CS2119") forms all resolve to canonical "DEPT NUMBER" keys.
    const excluded = new Set<string>();
    for (const code of criteria.excludedCourses ?? []) {
      for (const { dept, number } of candidateCodes(code)) {
        excluded.add(`${dept} ${number}`);
      }
    }

    return sections.filter(fs => {
      const dept = fs.course.departmentAbbr.toUpperCase();
      if (hasDeptRestriction && !allowed.has(dept)) return false;
      if (hasExclusions && excluded.has(`${dept} ${fs.course.number}`))
        return false;
      return true;
    });
  }

  isValidCriteria(criteria: unknown): criteria is DegreeBucketFilterCriteria {
    if (!criteria || typeof criteria !== 'object') return false;
    const c = criteria as DegreeBucketFilterCriteria;
    return (
      Array.isArray(c.allowedDepartments) &&
      c.allowedDepartments.every(d => typeof d === 'string') &&
      Array.isArray(c.excludedCourses) &&
      c.excludedCourses.every(d => typeof d === 'string')
    );
  }

  getDisplayValue(criteria: DegreeBucketFilterCriteria): string {
    const base = criteria.label ?? 'Degree Requirement';
    const depts = `${criteria.allowedDepartments.length} dept(s)`;
    const excl = criteria.excludedCourses.length
      ? `, ${criteria.excludedCourses.length} excluded`
      : '';
    return `${base}: ${depts}${excl}`;
  }
}
