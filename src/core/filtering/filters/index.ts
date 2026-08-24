export { SearchTextFilter } from './SearchTextFilter';
export { DegreeBucketFilter } from './DegreeBucketFilter';

import { SectionBasedFilter } from '../SectionFilterPipeline';
import { DepartmentFilter } from './DepartmentFilter';
import { AvailabilityFilter } from './AvailabilityFilter';
import { CreditRangeFilter } from './CreditRangeFilter';
import { TermFilter } from './TermFilter';
import { RMPRatingFilter } from './RMPRatingFilter';
import { WakeUpTimeFilter } from './WakeUpTimeFilter';
import { AcademicYearFilter } from './AcademicYearFilter';
import { GraduateLevelFilter } from './GraduateLevelFilter';
import { RateMyProfessorService } from '../../../services/external/RateMyProfessorService';

// All default filters (excludes SearchTextFilter and ConflictFilter which are registered separately)
export const createDefaultFilters = (
  rmpService: RateMyProfessorService,
): SectionBasedFilter[] => [
  new DepartmentFilter(),
  new AvailabilityFilter(),
  new CreditRangeFilter(),
  new TermFilter(),
  new RMPRatingFilter(rmpService),
  new WakeUpTimeFilter(),
  new AcademicYearFilter(),
  new GraduateLevelFilter(),
];
