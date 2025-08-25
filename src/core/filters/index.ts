export { DepartmentFilter } from './DepartmentFilter';
export { AvailabilityFilter } from './AvailabilityFilter';
export { CreditRangeFilter } from './CreditRangeFilter';
export { ProfessorFilter } from './ProfessorFilter';
export { TermFilter } from './TermFilter';
export { SearchTextFilter } from './SearchTextFilter';

import { CourseFilter } from '../../types/filters';
import { DepartmentFilter } from './DepartmentFilter';
import { AvailabilityFilter } from './AvailabilityFilter';
import { CreditRangeFilter } from './CreditRangeFilter';
import { ProfessorFilter } from './ProfessorFilter';
import { TermFilter } from './TermFilter';
import { ConflictDetector } from '../ConflictDetector';

// Default filter instances
export const createDefaultFilters = (conflictDetector?: ConflictDetector): CourseFilter[] => [
    new DepartmentFilter(),
    new AvailabilityFilter(conflictDetector || new ConflictDetector()),
    new CreditRangeFilter(),
    new ProfessorFilter(),
    new TermFilter(),
];

// Filter registry utility
export const createFilterRegistry = (conflictDetector?: ConflictDetector): Map<string, CourseFilter> => {
    const filters = createDefaultFilters(conflictDetector);
    const registry = new Map<string, CourseFilter>();
    
    filters.forEach(filter => {
        registry.set(filter.id, filter);
    });
    
    return registry;
};