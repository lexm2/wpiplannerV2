export { DepartmentFilter } from './DepartmentFilter';
export { AvailabilityFilter } from './AvailabilityFilter';
export { CreditRangeFilter } from './CreditRangeFilter';
export { ProfessorFilter } from './ProfessorFilter';
export { TermFilter } from './TermFilter';
export { SearchTextFilter } from './SearchTextFilter';
export { RMPRatingFilter } from './RMPRatingFilter';

import { CourseFilter } from '../../types/filters';
import { DepartmentFilter } from './DepartmentFilter';
import { AvailabilityFilter } from './AvailabilityFilter';
import { CreditRangeFilter } from './CreditRangeFilter';
import { ProfessorFilter } from './ProfessorFilter';
import { TermFilter } from './TermFilter';
import { RMPRatingFilter } from './RMPRatingFilter';
import { RateMyProfessorService } from '../../services/RateMyProfessorService';

// Default filter instances
export const createDefaultFilters = (rmpService: RateMyProfessorService): CourseFilter[] => [
    new DepartmentFilter(),
    new AvailabilityFilter(),
    new CreditRangeFilter(),
    new ProfessorFilter(),
    new TermFilter(),
    new RMPRatingFilter(rmpService),
];

// Filter registry utility
export const createFilterRegistry = (rmpService: RateMyProfessorService): Map<string, CourseFilter> => {
    const filters = createDefaultFilters(rmpService);
    const registry = new Map<string, CourseFilter>();

    filters.forEach(filter => {
        registry.set(filter.id, filter);
    });

    return registry;
};