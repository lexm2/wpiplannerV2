import type { Course, Section, SectionsByKind } from '../../types/types';
import type { SelectedCourse, WeeklyTimeSlot } from '../../types/schedule';
import type { SectionCandidate } from '../../types/scheduling';
import {
  sectionToMask,
  masksConflict,
} from '../../core/scheduling/BitMaskEngine';
import type { FilterService } from '../filtering/FilterService';
import { ConflictFilter } from '../../core/filtering/filters/ConflictFilter';
import type { ConflictCriteria } from '../../types/filters';

export interface ScheduleResult {
  course: Course;
  combination: SectionsByKind;
}

interface CourseTypeInfo {
  hasLectures: boolean;
  hasDiscussions: boolean;
  hasLabs: boolean;
  isStandaloneLab: boolean;
}

export interface MaskedCandidate {
  combination: SectionsByKind;
  mask: bigint;
  term: string;
}

/**
 * Generates conflict-free schedules using bitmask optimization.
 * Conflict check: (mask1 & mask2) !== 0n - O(1)
 */
export class AutoScheduler {
  constructor(private filterService: FilterService) {}

  getBlockedMasksByTerm(): Map<string, bigint> {
    const activeFilters = this.filterService.getActiveFilters();

    const conflictFilter =
      this.filterService.getRegisteredFilter('periodConflict');
    if (conflictFilter instanceof ConflictFilter) {
      const criteria = activeFilters.find(
        f => f.id === 'periodConflict',
      )?.criteria;
      if (criteria && conflictFilter.isValidCriteria(criteria)) {
        return conflictFilter.getBlockedMasksByTerm(
          criteria as ConflictCriteria,
        );
      }
    }

    const blockedTimesCriteria = activeFilters.find(
      f => f.id === 'blockedTimes',
    )?.criteria as { blockedTimes?: WeeklyTimeSlot[] } | undefined;
    const blockedTimes = blockedTimesCriteria?.blockedTimes;
    if (blockedTimes && blockedTimes.length > 0) {
      const tempFilter = new ConflictFilter();
      return tempFilter.getBlockedMasksByTerm({
        avoidConflicts: true,
        blockedSlots: blockedTimes,
      });
    }

    return new Map();
  }

  getMaskedCandidates(
    selectedCourse: SelectedCourse,
    blockedMasksByTerm: Map<string, bigint>,
  ): MaskedCandidate[] {
    const course = selectedCourse.course;
    const candidates: MaskedCandidate[] = [];
    const typeInfo = this.detectCourseTypes(course);

    const allowedTerms = selectedCourse.allowedTerms;

    if (typeInfo.isStandaloneLab) {
      const labs = course.standaloneLabs || [];

      for (const lab of labs) {
        if (allowedTerms && !allowedTerms.includes(lab.computedTerm)) continue;
        if (!this.isValidSection(lab, blockedMasksByTerm, selectedCourse))
          continue;

        const mask = sectionToMask(lab);
        const candidate: MaskedCandidate = {
          combination: { lab },
          mask,
          term: lab.computedTerm,
        };

        candidates.push(candidate);
      }

      return candidates;
    }

    if (!course.lectures || course.lectures.length === 0) {
      return candidates;
    }

    for (const lectureGroup of course.lectures) {
      const lecture = lectureGroup.section;
      if (allowedTerms && !allowedTerms.includes(lecture.computedTerm))
        continue;
      if (!this.isValidSection(lecture, blockedMasksByTerm, selectedCourse))
        continue;

      const lectureMask = sectionToMask(lecture);

      // Get valid discussion candidates - must be same term as lecture
      const discussionCandidates: SectionCandidate[] = [];
      if (typeInfo.hasDiscussions) {
        const discussions = lectureGroup.compatibleDiscussions || [];

        for (const d of discussions) {
          if (d.computedTerm !== lecture.computedTerm) continue;
          if (!this.isValidSection(d, blockedMasksByTerm, selectedCourse))
            continue;
          const mask = sectionToMask(d);
          if (masksConflict(lectureMask, mask)) continue;
          discussionCandidates.push({ section: d, mask });
        }
      } else {
        discussionCandidates.push({ section: null, mask: 0n });
      }

      // Get valid lab candidates - must be same term as lecture
      const labCandidates: SectionCandidate[] = [];
      if (typeInfo.hasLabs) {
        const labs = lectureGroup.compatibleLabs || [];

        for (const l of labs) {
          if (l.computedTerm !== lecture.computedTerm) continue;
          if (!this.isValidSection(l, blockedMasksByTerm, selectedCourse))
            continue;
          const mask = sectionToMask(l);
          if (masksConflict(lectureMask, mask)) continue;
          labCandidates.push({ section: l, mask });
        }
      } else {
        labCandidates.push({ section: null, mask: 0n });
      }

      if (discussionCandidates.length === 0 || labCandidates.length === 0)
        continue;

      for (const disc of discussionCandidates) {
        for (const lab of labCandidates) {
          if (disc.section && lab.section && masksConflict(disc.mask, lab.mask))
            continue;

          const combinedMask = lectureMask | disc.mask | lab.mask;
          const candidate: MaskedCandidate = {
            combination: {
              lecture,
              ...(disc.section && { discussion: disc.section }),
              ...(lab.section && { lab: lab.section }),
            },
            mask: combinedMask,
            term: lecture.computedTerm,
          };

          candidates.push(candidate);
        }
      }
    }

    return candidates;
  }

  /**
   * Check if a section is valid (has time slots, passes filters, doesn't conflict with blocked times)
   */
  private isValidSection(
    section: Section,
    blockedMasksByTerm: Map<string, bigint>,
    selectedCourse: SelectedCourse,
  ): boolean {
    if (!this.hasValidTimeSlot(section)) return false;

    // Check blocked time conflict using bitmask - O(1)
    const sectionMask = sectionToMask(section);
    let blockedMask: bigint;
    if (section.computedTerm === 'F') {
      blockedMask =
        (blockedMasksByTerm.get('A') || 0n) |
        (blockedMasksByTerm.get('B') || 0n);
    } else if (section.computedTerm === 'S') {
      blockedMask =
        (blockedMasksByTerm.get('C') || 0n) |
        (blockedMasksByTerm.get('D') || 0n);
    } else {
      blockedMask = blockedMasksByTerm.get(section.computedTerm) || 0n;
    }
    if (masksConflict(sectionMask, blockedMask)) return false;

    return this.sectionPassesFilters(section, selectedCourse);
  }

  private detectCourseTypes(course: Course): CourseTypeInfo {
    let hasLectures = false;
    let hasDiscussions = false;
    let hasLabs = false;

    if (course.lectures && course.lectures.length > 0) {
      hasLectures = true;

      for (const lectureGroup of course.lectures) {
        if (lectureGroup.compatibleDiscussions?.length) hasDiscussions = true;
        if (lectureGroup.compatibleLabs?.length) hasLabs = true;
      }
    }

    const isStandaloneLab = !hasLectures && !!course.standaloneLabs?.length;
    if (isStandaloneLab) hasLabs = true;

    return { hasLectures, hasDiscussions, hasLabs, isStandaloneLab };
  }

  /**
   * Check if a section has at least one valid time slot (or is async).
   */
  private hasValidTimeSlot(section: Section): boolean {
    if (!section.periods?.length) return false;

    return section.periods.some(period => {
      // Async periods are always valid (no time slot needed)
      if (period.isAsync) return true;

      const hasTime =
        period.startTime.hours !== period.endTime.hours ||
        period.startTime.minutes !== period.endTime.minutes;
      const hasDays = period.days?.size > 0;
      return hasTime && hasDays;
    });
  }

  private sectionPassesFilters(
    section: Section,
    selectedCourse: SelectedCourse,
  ): boolean {
    if (!this.hasValidTimeSlot(section)) return false;

    const filteredSections = this.filterService.apply([selectedCourse.course]);
    return filteredSections.some(fs => fs.section.crn === section.crn);
  }
}
