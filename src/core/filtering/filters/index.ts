/**
 * The one list of course filters. The app (AppBootstrap) and the course API
 * (src/api/query.ts) both register from it, and adding a filter here is all
 * it takes for the API to offer it: the API builds its filter inputs from
 * each entry's `criteria` schema, skipping those marked `internal`.
 *
 * Priorities decide run order, not position in this list. The only equal
 * priority is 25 (department, term), per-section predicates that commute.
 */
import type * as z from 'zod';
import type { SectionBasedFilter } from '../SectionFilterPipeline';
import type { RateMyProfessorService } from '../../../services/external/RateMyProfessorService';
import { SearchTextFilter } from './SearchTextFilter';
import { DepartmentFilter } from './DepartmentFilter';
import { TermFilter } from './TermFilter';
import { AcademicYearFilter } from './AcademicYearFilter';
import { AvailabilityFilter } from './AvailabilityFilter';
import { CreditRangeFilter } from './CreditRangeFilter';
import { GraduateLevelFilter } from './GraduateLevelFilter';
import { CourseLevelRangeFilter } from './CourseLevelRangeFilter';
import { DegreeAttributeFilter } from './DegreeAttributeFilter';
import { DeliveryModeFilter } from './DeliveryModeFilter';
import { OfferingPatternFilter } from './OfferingPatternFilter';
import { TimesFilter } from './TimesFilter';
import { RMPRatingFilter } from './RMPRatingFilter';
import { ConflictFilter } from './ConflictFilter';
import { InterestListFilter } from './InterestListFilter';
import { DegreeBucketFilter } from './DegreeBucketFilter';

export interface FilterDeps {
  rmp: RateMyProfessorService;
}

/** A filter class as the registry holds it: what it takes, and how to make one. */
export interface FilterClass {
  readonly id: string;
  readonly criteria: z.ZodObject;
  /** Not offered by the course API as a filter input. */
  readonly internal?: true;
  new (deps: FilterDeps): SectionBasedFilter;
}

/** Every filter the app registers, in the order the course API lists them. */
export const FILTERS = [
  SearchTextFilter,
  DepartmentFilter,
  TermFilter,
  AcademicYearFilter,
  AvailabilityFilter,
  CreditRangeFilter,
  GraduateLevelFilter,
  CourseLevelRangeFilter,
  DegreeAttributeFilter,
  DeliveryModeFilter,
  OfferingPatternFilter,
  TimesFilter,
  RMPRatingFilter,
  ConflictFilter,
  InterestListFilter,
  DegreeBucketFilter,
] as const satisfies readonly FilterClass[];

export const createFilters = (deps: FilterDeps): SectionBasedFilter[] =>
  FILTERS.map(F => new F(deps));
