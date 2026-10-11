import type { Course, Section, SectionsByKind } from '../../types/types';
import type { SelectedCourse } from '../../types/schedule';
import { AcademicTerm } from '../../types/schedule';
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

  /**
   * Time that is already taken, per quarter: the conflict filter's blocked
   * slots, plus the chosen sections of `fixedCourses` (courses locked in the
   * auto-schedule intro), which block whether or not the filter is on.
   *
   * The filter's own `selectedCourses` is deliberately ignored: it is a
   * snapshot from when "avoid conflicts" was switched on, and it holds the
   * old sections of the very courses being rescheduled. The sections that
   * stay put are exactly the fixed ones.
   */
  getBlockedMasksByTerm(
    fixedCourses: SelectedCourse[] = [],
  ): Map<string, bigint> {
    const conflictFilter = new ConflictFilter();
    const criteria = this.filterService
      .getActiveFilters()
      .find(f => f.id === 'periodConflict')?.criteria;
    const blockedSlots = conflictFilter.isValidCriteria(criteria)
      ? (criteria as ConflictCriteria).blockedSlots
      : [];

    return conflictFilter.getBlockedMasksByTerm({
      avoidConflicts: true,
      blockedSlots: blockedSlots ?? [],
      selectedCourses: fixedCourses,
    });
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

  private isValidSection(
    section: Section,
    blockedMasksByTerm: Map<string, bigint>,
    selectedCourse: SelectedCourse,
  ): boolean {
    if (!this.hasValidTimeSlot(section)) return false;

    // Check blocked time conflict using bitmask - O(1)
    const sectionMask = sectionToMask(section);
    let blockedMask: bigint;
    if (section.computedTerm === AcademicTerm.F) {
      blockedMask =
        (blockedMasksByTerm.get('A') || 0n) |
        (blockedMasksByTerm.get('B') || 0n);
    } else if (section.computedTerm === AcademicTerm.S) {
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

    // Time conflicts are checked against the blocked masks instead (see
    // getBlockedMasksByTerm), so skip the conflict filter's stale snapshot.
    const filteredSections = this.filterService.applyExcluding(
      [selectedCourse.course],
      ['periodConflict'],
    );
    return filteredSections.some(fs => fs.section.crn === section.crn);
  }
}
