import { AcademicTerm, WeeklyTimeSlot } from '../../../types/schedule';
import { ConflictCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import { FilterableSection } from '../../../types/filterableUnit';
import {
  periodToWeeklySlots,
  sectionToWeeklySlots,
  slotsOverlap,
} from '../../../utils/timeSlotUtils';
import { weeklySlotToMask } from '../../scheduling/BitMaskEngine';
import { getSelectedSections } from '../../../utils/courseUtils';

const QUARTERS = [
  AcademicTerm.A,
  AcademicTerm.B,
  AcademicTerm.C,
  AcademicTerm.D,
];

/**
 * The terms a slot occupies, for overlap tests and mask keys. With `spans`
 * a semester term is its two quarters, so F meets A and B. Without it terms
 * stand alone, and only ALL reaches every other term.
 */
function termsCovered(term: AcademicTerm, spans: boolean): AcademicTerm[] {
  if (spans) {
    if (term === AcademicTerm.ALL) return QUARTERS;
    if (term === AcademicTerm.F) return [AcademicTerm.A, AcademicTerm.B];
    if (term === AcademicTerm.S) return [AcademicTerm.C, AcademicTerm.D];
    return [term];
  }
  if (term === AcademicTerm.ALL)
    return [...QUARTERS, AcademicTerm.F, AcademicTerm.S];
  return [term];
}

export class ConflictFilter implements SectionBasedFilter {
  readonly id = 'periodConflict';
  readonly name = 'Time Conflicts';
  readonly description =
    'Hide periods that conflict with selected sections or blocked times';
  readonly priority = 65;

  private blockedMasksByTerm: Map<string, bigint> = new Map();

  apply(
    sections: FilterableSection[],
    criteria: unknown,
    _activeFilters?: Map<string, unknown>,
  ): FilterableSection[] {
    return this.applyToFilterableSections(
      sections,
      criteria as ConflictCriteria,
    );
  }

  private applyToFilterableSections(
    sections: FilterableSection[],
    criteria: ConflictCriteria,
  ): FilterableSection[] {
    if (!criteria.avoidConflicts) {
      return sections;
    }

    const blockedSlots = this.getBlockedSlots(criteria);
    if (blockedSlots.length === 0) {
      return sections;
    }
    const spans = criteria.semesterSpansQuarters ?? true;

    // Selected section CRNs per course: a course is never hidden for clashing
    // with its own picks, since another of its sections would replace them.
    const ownCrnsByCourse = new Map<string, Set<string>>();
    for (const sc of criteria.selectedCourses ?? []) {
      ownCrnsByCourse.set(
        sc.course.id,
        new Set(getSelectedSections(sc).map(s => String(s.crn))),
      );
    }
    const selectedCrns = new Set(
      [...ownCrnsByCourse.values()].flatMap(crns => [...crns]),
    );

    return sections.filter(fs => {
      const currentCrn = String(fs.section.crn);
      const ownCrns = ownCrnsByCourse.get(fs.course.id);

      // Never filter out a currently selected section
      if (selectedCrns.has(currentCrn)) {
        return true;
      }

      // Exclude blocked slots that came from this section's own course
      const relevantBlockedSlots = blockedSlots.filter(slot => {
        const slotCrn = slot.id.split('-')[0];
        return slotCrn !== currentCrn && !ownCrns?.has(slotCrn);
      });

      if (relevantBlockedSlots.length === 0) {
        return true;
      }

      for (const currentPeriod of fs.section.periods) {
        const periodSlots = periodToWeeklySlots(
          currentPeriod,
          fs.section.computedTerm || AcademicTerm.ALL,
        );
        if (
          this.hasConflictWithBlockedSlots(
            periodSlots,
            relevantBlockedSlots,
            spans,
          )
        ) {
          return false;
        }
      }
      return true;
    });
  }

  private getBlockedSlots(criteria: ConflictCriteria): WeeklyTimeSlot[] {
    const slots: WeeklyTimeSlot[] = [];

    if (criteria.blockedSlots) {
      slots.push(...criteria.blockedSlots);
    }

    for (const sc of criteria.selectedCourses ?? []) {
      for (const section of getSelectedSections(sc)) {
        slots.push(...sectionToWeeklySlots(section));
      }
    }

    return slots;
  }

  private hasConflictWithBlockedSlots(
    testSlots: WeeklyTimeSlot[],
    blockedSlots: WeeklyTimeSlot[],
    spans: boolean,
  ): boolean {
    for (const testSlot of testSlots) {
      for (const blockedSlot of blockedSlots) {
        if (this.slotsConflict(testSlot, blockedSlot, spans)) {
          return true;
        }
      }
    }
    return false;
  }

  private slotsConflict(
    slot1: WeeklyTimeSlot,
    slot2: WeeklyTimeSlot,
    spans: boolean,
  ): boolean {
    const terms2 = termsCovered(slot2.term, spans);
    if (!termsCovered(slot1.term, spans).some(t => terms2.includes(t))) {
      return false;
    }

    if (slot1.day !== slot2.day) {
      return false;
    }

    return slotsOverlap(slot1, slot2);
  }

  isValidCriteria(criteria: unknown): boolean {
    if (!criteria || typeof criteria !== 'object') {
      return false;
    }
    return (
      typeof (criteria as Record<string, unknown>).avoidConflicts === 'boolean'
    );
  }

  getDisplayValue(criteria: unknown): string {
    if (!criteria || typeof criteria !== 'object') return 'Conflicts allowed';
    const c = criteria as ConflictCriteria;
    if (c.avoidConflicts) {
      const blockedSlots = this.getBlockedSlots(c);
      if (blockedSlots.length > 0) {
        return `Avoiding conflicts (${blockedSlots.length} blocked slots)`;
      }
      return 'Avoiding conflicts';
    }
    return 'Conflicts allowed';
  }

  private precomputeBlockedMasks(
    blockedSlots: WeeklyTimeSlot[],
    spans: boolean,
  ): void {
    this.blockedMasksByTerm.clear();

    for (const slot of blockedSlots) {
      const mask = weeklySlotToMask(slot);
      if (mask === 0n) continue;

      for (const term of termsCovered(slot.term, spans)) {
        const existing = this.blockedMasksByTerm.get(term) || 0n;
        this.blockedMasksByTerm.set(term, existing | mask);
      }
    }
  }

  getBlockedMasksByTerm(criteria?: ConflictCriteria): Map<string, bigint> {
    if (criteria) {
      const blockedSlots = this.getBlockedSlots(criteria);
      this.precomputeBlockedMasks(
        blockedSlots,
        criteria.semesterSpansQuarters ?? true,
      );
    }
    return new Map(this.blockedMasksByTerm);
  }
}
