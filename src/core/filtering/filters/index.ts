export { DepartmentFilter } from './DepartmentFilter';
export { AvailabilityFilter } from './AvailabilityFilter';
export { CreditRangeFilter } from './CreditRangeFilter';
export { ProfessorFilter } from './ProfessorFilter';
export { TermFilter } from './TermFilter';
export { SearchTextFilter } from './SearchTextFilter';
export { RMPRatingFilter } from './RMPRatingFilter';
export { ConflictFilter } from './ConflictFilter';
export { WakeUpTimeFilter } from './WakeUpTimeFilter';

import { SectionBasedFilter } from '../SectionFilterPipeline';
import { DepartmentFilter } from './DepartmentFilter';
import { AvailabilityFilter } from './AvailabilityFilter';
import { CreditRangeFilter } from './CreditRangeFilter';
import { ProfessorFilter } from './ProfessorFilter';
import { TermFilter } from './TermFilter';
import { RMPRatingFilter } from './RMPRatingFilter';
import { RateMyProfessorService } from '../../../services/external';

// Default filter instances
export const createDefaultFilters = (rmpService: RateMyProfessorService): SectionBasedFilter[] => [
    new DepartmentFilter(),
    new AvailabilityFilter(),
    new CreditRangeFilter(),
    new ProfessorFilter(),
    new TermFilter(),
    new RMPRatingFilter(rmpService),
];

// Filter registry utility
export const createFilterRegistry = (rmpService: RateMyProfessorService): Map<string, SectionBasedFilter> => {
    const filters = createDefaultFilters(rmpService);
    const registry = new Map<string, SectionBasedFilter>();

    filters.forEach(filter => {
        registry.set(filter.id, filter);
    });

    return registry;
};