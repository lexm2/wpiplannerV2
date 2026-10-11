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
          this.hasConflictWithBlockedSlots(periodSlots, relevantBlockedSlots)
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
  ): boolean {
    for (const testSlot of testSlots) {
      for (const blockedSlot of blockedSlots) {
        if (this.slotsConflict(testSlot, blockedSlot)) {
          return true;
        }
      }
    }
    return false;
  }

  private slotsConflict(slot1: WeeklyTimeSlot, slot2: WeeklyTimeSlot): boolean {
    if (
      slot1.term !== AcademicTerm.ALL &&
      slot2.term !== AcademicTerm.ALL &&
      slot1.term !== slot2.term
    ) {
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

  private precomputeBlockedMasks(blockedSlots: WeeklyTimeSlot[]): void {
    this.blockedMasksByTerm.clear();

    for (const slot of blockedSlots) {
      const mask = weeklySlotToMask(slot);
      if (mask === 0n) continue;

      let terms: string[];
      if (slot.term === AcademicTerm.ALL) {
        terms = ['A', 'B', 'C', 'D'];
      } else if (slot.term === AcademicTerm.F) {
        terms = ['A', 'B'];
      } else if (slot.term === AcademicTerm.S) {
        terms = ['C', 'D'];
      } else {
        terms = [slot.term];
      }

      for (const term of terms) {
        const existing = this.blockedMasksByTerm.get(term) || 0n;
        this.blockedMasksByTerm.set(term, existing | mask);
      }
    }
  }

  getBlockedMasksByTerm(criteria?: ConflictCriteria): Map<string, bigint> {
    if (criteria) {
      const blockedSlots = this.getBlockedSlots(criteria);
      this.precomputeBlockedMasks(blockedSlots);
    }
    return new Map(this.blockedMasksByTerm);
  }
}
