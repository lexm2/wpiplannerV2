import { AcademicTerm, WeeklyTimeSlot } from '../../../types/schedule';
import { ConflictCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import { FilterableSection } from '../../../types/filterableUnit';
import {
  datesMeet,
  sectionToWeeklySlots,
  termsCovered,
} from '../../../utils/timeSlotUtils';
import { weeklySlotToMask } from '../../scheduling/BitMaskEngine';
import { getSelectedSections } from '../../../utils/courseUtils';

/** A blocked slot parsed once per apply: owning CRN, terms, minute range. */
interface PreparedSlot {
  crn: string;
  terms: AcademicTerm[];
  start: number;
  end: number;
  startDate?: string;
  endDate?: string;
}

export class ConflictFilter implements SectionBasedFilter {
  readonly id = 'periodConflict';
  readonly name = 'Time Conflicts';
  readonly description =
    'Hide periods that conflict with selected sections or blocked times';
  readonly priority = 65;

  private blockedMasksByTerm: Map<string, bigint> = new Map();

  apply(sections: FilterableSection[], criteria: unknown): FilterableSection[] {
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

    // Parse each blocked slot once per apply, bucketed by day: the per-section
    // test below is then plain number and set work.
    const blockedByDay = new Map<string, PreparedSlot[]>();
    for (const slot of blockedSlots) {
      const prepared: PreparedSlot = {
        crn: slot.id.split('-')[0],
        terms: termsCovered(slot.term, spans),
        start: slot.startTime.hours * 60 + slot.startTime.minutes,
        end: slot.endTime.hours * 60 + slot.endTime.minutes,
        startDate: slot.startDate,
        endDate: slot.endDate,
      };
      const forDay = blockedByDay.get(slot.day);
      if (forDay) forDay.push(prepared);
      else blockedByDay.set(slot.day, [prepared]);
    }

    return sections.filter(fs => {
      const currentCrn = String(fs.section.crn);
      const ownCrns = ownCrnsByCourse.get(fs.course.id);

      // Never filter out a currently selected section
      if (selectedCrns.has(currentCrn)) {
        return true;
      }

      const sectionTerms = termsCovered(
        fs.section.computedTerm || AcademicTerm.ALL,
        spans,
      );

      for (const period of fs.section.periods) {
        const start = period.startTime.hours * 60 + period.startTime.minutes;
        const end = period.endTime.hours * 60 + period.endTime.minutes;
        for (const day of period.days) {
          for (const blocked of blockedByDay.get(day) ?? []) {
            // Skip blocked slots that came from this section's own course
            if (blocked.crn === currentCrn || ownCrns?.has(blocked.crn)) {
              continue;
            }
            if (
              start < blocked.end &&
              blocked.start < end &&
              blocked.terms.some(t => sectionTerms.includes(t)) &&
              datesMeet(
                fs.section.startDate,
                fs.section.endDate,
                blocked.startDate,
                blocked.endDate,
              )
            ) {
              return false;
            }
          }
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
  ): Map<string, bigint> {
    const masks = new Map<string, bigint>();

    for (const slot of blockedSlots) {
      const mask = weeklySlotToMask(slot);
      if (mask === 0n) continue;

      for (const term of termsCovered(slot.term, spans)) {
        masks.set(term, (masks.get(term) || 0n) | mask);
      }
    }
    return masks;
  }

  getBlockedMasksByTerm(criteria?: ConflictCriteria): Map<string, bigint> {
    if (criteria) {
      const blockedSlots = this.getBlockedSlots(criteria);
      this.blockedMasksByTerm = this.precomputeBlockedMasks(
        blockedSlots,
        criteria.semesterSpansQuarters ?? true,
      );
    }
    return new Map(this.blockedMasksByTerm);
  }
}
