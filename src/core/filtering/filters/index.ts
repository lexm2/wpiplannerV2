export { SearchTextFilter } from './SearchTextFilter';
export { DegreeBucketFilter } from './DegreeBucketFilter';

import { SectionBasedFilter } from '../SectionFilterPipeline';
import { DepartmentFilter } from './DepartmentFilter';
import { AvailabilityFilter } from './AvailabilityFilter';
import { CreditRangeFilter } from './CreditRangeFilter';
import { TermFilter } from './TermFilter';
import { RMPRatingFilter } from './RMPRatingFilter';
import { TimesFilter } from './TimesFilter';
import { AcademicYearFilter } from './AcademicYearFilter';
import { GraduateLevelFilter } from './GraduateLevelFilter';
import { DegreeAttributeFilter } from './DegreeAttributeFilter';
import { DeliveryModeFilter } from './DeliveryModeFilter';
import { CourseLevelRangeFilter } from './CourseLevelRangeFilter';
import { OfferingPatternFilter } from './OfferingPatternFilter';
import { InterestListFilter } from './InterestListFilter';
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
  new TimesFilter(),
  new AcademicYearFilter(),
  new GraduateLevelFilter(),
  new DegreeAttributeFilter(),
  new DeliveryModeFilter(),
  new CourseLevelRangeFilter(),
  new OfferingPatternFilter(),
  new InterestListFilter(),
];
