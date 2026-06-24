export { DepartmentFilter } from './DepartmentFilter';
export { AvailabilityFilter } from './AvailabilityFilter';
export { CreditRangeFilter } from './CreditRangeFilter';
export { ProfessorFilter } from './ProfessorFilter';
export { TermFilter } from './TermFilter';
export { SearchTextFilter } from './SearchTextFilter';
export { RMPRatingFilter } from './RMPRatingFilter';
export { ConflictFilter } from './ConflictFilter';
export { WakeUpTimeFilter } from './WakeUpTimeFilter';
export { PeriodDaysFilter } from './PeriodDaysFilter';
export { SectionCodeFilter } from './SectionCodeFilter';
export { PeriodTypeFilter } from './PeriodTypeFilter';
export { AcademicYearFilter } from './AcademicYearFilter';
export { GraduateLevelFilter } from './GraduateLevelFilter';
export { DegreeBucketFilter } from './DegreeBucketFilter';

import { SectionBasedFilter } from '../SectionFilterPipeline';
import { DepartmentFilter } from './DepartmentFilter';
import { AvailabilityFilter } from './AvailabilityFilter';
import { CreditRangeFilter } from './CreditRangeFilter';
import { ProfessorFilter } from './ProfessorFilter';
import { TermFilter } from './TermFilter';
import { RMPRatingFilter } from './RMPRatingFilter';
import { PeriodDaysFilter } from './PeriodDaysFilter';
import { SectionCodeFilter } from './SectionCodeFilter';
import { WakeUpTimeFilter } from './WakeUpTimeFilter';
import { PeriodTypeFilter } from './PeriodTypeFilter';
import { AcademicYearFilter } from './AcademicYearFilter';
import { GraduateLevelFilter } from './GraduateLevelFilter';
import { RateMyProfessorService } from '../../../services/external';

// All default filters (excludes SearchTextFilter and ConflictFilter which are registered separately)
export const createDefaultFilters = (rmpService: RateMyProfessorService): SectionBasedFilter[] => [
    new DepartmentFilter(),
    new AvailabilityFilter(),
    new CreditRangeFilter(),
    new ProfessorFilter(),
    new TermFilter(),
    new RMPRatingFilter(rmpService),
    new PeriodDaysFilter(),
    new SectionCodeFilter(),
    new WakeUpTimeFilter(),
    new PeriodTypeFilter(),
    new AcademicYearFilter(),
    new GraduateLevelFilter(),
];

export const createFilterRegistry = (rmpService: RateMyProfessorService): Map<string, SectionBasedFilter> => {
    const filters = createDefaultFilters(rmpService);
    const registry = new Map<string, SectionBasedFilter>();

    filters.forEach(filter => {
        registry.set(filter.id, filter);
    });

    return registry;
};
