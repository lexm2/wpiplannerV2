export { DepartmentFilter } from './DepartmentFilter';
export { AvailabilityFilter } from './AvailabilityFilter';
export { CreditRangeFilter } from './CreditRangeFilter';
export { ProfessorFilter } from './ProfessorFilter';
export { TermFilter } from './TermFilter';
export { LocationFilter } from './LocationFilter';
export { SearchTextFilter } from './SearchTextFilter';

import { CourseFilter } from '../../types/filters';
import { DepartmentFilter } from './DepartmentFilter';
import { AvailabilityFilter } from './AvailabilityFilter';
import { CreditRangeFilter } from './CreditRangeFilter';
import { ProfessorFilter } from './ProfessorFilter';
import { TermFilter } from './TermFilter';
import { LocationFilter } from './LocationFilter';

// Default filter instances
export const createDefaultFilters = (): CourseFilter[] => [
    new DepartmentFilter(),
    new AvailabilityFilter(),
    new CreditRangeFilter(),
    new ProfessorFilter(),
    new TermFilter(),
    new LocationFilter()
];

// Filter registry utility
export const createFilterRegistry = (): Map<string, CourseFilter> => {
    const filters = createDefaultFilters();
    const registry = new Map<string, CourseFilter>();
    
    filters.forEach(filter => {
        registry.set(filter.id, filter);
    });
    
    return registry;
};