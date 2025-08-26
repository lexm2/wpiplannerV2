import { Course } from '../../types/types';
import { CourseFilter, DepartmentFilterCriteria } from '../../types/filters';

export class DepartmentFilter implements CourseFilter {
    readonly id = 'department';
    readonly name = 'Department';
    readonly description = 'Filter courses by department(s)';

    apply(courses: Course[], criteria: DepartmentFilterCriteria): Course[] {
        if (!criteria.departments || criteria.departments.length === 0) {
            return courses;
        }
        
        const departmentSet = new Set(
            criteria.departments.map(dept => dept.toLowerCase())
        );
        
        return courses.filter(course => 
            departmentSet.has(course.department.abbreviation.toLowerCase())
        );
    }
    
    isValidCriteria(criteria: any): criteria is DepartmentFilterCriteria {
        return criteria && 
               Array.isArray(criteria.departments) &&
               criteria.departments.every((dept: any) => typeof dept === 'string');
    }
    
    getDisplayValue(criteria: DepartmentFilterCriteria): string {
        if (criteria.departments.length === 1) {
            return `Department: ${criteria.departments[0]}`;
        }
        return `Departments: ${criteria.departments.join(', ')}`;
    }
}