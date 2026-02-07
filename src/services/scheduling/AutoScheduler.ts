import type { Course, Section, DayOfWeek } from '../../types/types';
import type { SelectedCourse } from '../../types/schedule';
import { sectionToMask, masksConflict } from '../../core/scheduling/BitMaskEngine';
import type { ScheduleFilterService } from '../filtering/ScheduleFilterService';
import { ConflictFilter } from '../../core/filtering/filters/ConflictFilter';

export interface SectionCombination {
  lecture: Section | null;
  discussion: Section | null;
  lab: Section | null;
}

export interface ScheduleResult {
  course: Course;
  combination: SectionCombination;
  isLocked?: boolean;
}

interface CourseTypeInfo {
  hasLectures: boolean;
  hasDiscussions: boolean;
  hasLabs: boolean;
  isStandaloneLab: boolean;
}

interface MaskedCandidate {
  combination: SectionCombination;
  mask: bigint;
  term: string;
}

/**
 * Generates conflict-free schedules using bitmask optimization.
 * Conflict check: (mask1 & mask2) !== 0n - O(1)
 */
export class AutoScheduler {
  constructor(private scheduleFilterService: ScheduleFilterService) {}

  generateSchedules(
    selectedCourses: SelectedCourse[],
    maxResults: number = 100
  ): ScheduleResult[][] {
    if (selectedCourses.length === 0) {
      return [];
    }

    const blockedMasksByTerm = this.getBlockedMasksByTerm();

    const lockedResults: ScheduleResult[] = [];
    const incompleteCourses: SelectedCourse[] = [];
    const lockedMaskByTerm = new Map<string, bigint>();

    // Separate locked vs incomplete courses
    for (const selectedCourse of selectedCourses) {
      const lockedCombination = this.getLockedCombination(selectedCourse);
      if (lockedCombination) {
        lockedResults.push({
          course: selectedCourse.course,
          combination: lockedCombination,
          isLocked: true
        });

        // Add locked sections to the combined mask
        const mask = this.combinationToMask(lockedCombination);
        const term = this.getCombinationTerm(lockedCombination);
        if (term) {
          const existing = lockedMaskByTerm.get(term) || 0n;
          lockedMaskByTerm.set(term, existing | mask);
        }
      } else {
        incompleteCourses.push(selectedCourse);
      }
    }

    // If everything is locked, return single schedule
    if (incompleteCourses.length === 0) {
      return [lockedResults];
    }

    // Get masked candidates for each incomplete course
    const candidatesPerCourse: MaskedCandidate[][] = [];

    for (const selectedCourse of incompleteCourses) {
      const candidates = this.getMaskedCandidates(selectedCourse, blockedMasksByTerm);

      if (candidates.length === 0) {
        console.warn(`[AutoScheduler] No valid candidates for ${selectedCourse.course.departmentAbbr}${selectedCourse.course.number}`);
        return [];
      }

      candidatesPerCourse.push(candidates);
    }

    // Generate valid schedules using recursive backtracking with bitmask pruning
    const validSchedules: ScheduleResult[][] = [];

    this.generateWithBacktracking(
      incompleteCourses,
      candidatesPerCourse,
      0,
      lockedMaskByTerm,
      [],
      lockedResults,
      validSchedules,
      maxResults
    );

    return validSchedules;
  }

  private getBlockedMasksByTerm(): Map<string, bigint> {
    const filter = this.scheduleFilterService.getSectionBasedFilter('periodConflict');
    if (filter instanceof ConflictFilter) {
      const activeFilters = this.scheduleFilterService.getActiveFilters();
      const criteria = activeFilters.find(f => f.id === 'periodConflict')?.criteria;
      if (criteria && filter.isValidCriteria(criteria)) {
        return filter.getBlockedMasksByTerm(criteria as any);
      }
    }
    return new Map();
  }

  private generateWithBacktracking(
    courses: SelectedCourse[],
    candidatesPerCourse: MaskedCandidate[][],
    courseIndex: number,
    currentMaskByTerm: Map<string, bigint>,
    currentSelections: MaskedCandidate[],
    lockedResults: ScheduleResult[],
    results: ScheduleResult[][],
    maxResults: number
  ): void {
    // Check if we've found enough schedules
    if (results.length >= maxResults) return;

    // Base case: all courses assigned
    if (courseIndex >= courses.length) {
      const schedule = [
        ...lockedResults,
        ...currentSelections.map((candidate, i) => ({
          course: courses[i].course,
          combination: candidate.combination
        }))
      ];
      results.push(schedule);
      return;
    }

    const candidates = candidatesPerCourse[courseIndex];

    for (const candidate of candidates) {
      const term = candidate.term;
      const existingMask = currentMaskByTerm.get(term) || 0n;

      if (masksConflict(candidate.mask, existingMask)) continue;

      currentSelections.push(candidate);
      const newMaskByTerm = new Map(currentMaskByTerm);
      newMaskByTerm.set(term, existingMask | candidate.mask);

      this.generateWithBacktracking(
        courses, candidatesPerCourse, courseIndex + 1, newMaskByTerm,
        currentSelections, lockedResults, results, maxResults
      );

      currentSelections.pop();
      if (results.length >= maxResults) return;
    }
  }

  generateSchedule(
    selectedCourses: SelectedCourse[]
  ): ScheduleResult[] | null {
    const schedules = this.generateSchedules(selectedCourses, 1);
    return schedules.length > 0 ? schedules[0] : null;
  }

  /**
   * Get all valid candidate combinations for a course, precomputed with bitmasks.
   * Filters out candidates that conflict with blocked times or have internal conflicts.
   */
  private getMaskedCandidates(
    selectedCourse: SelectedCourse,
    blockedMasksByTerm: Map<string, bigint>
  ): MaskedCandidate[] {
    const course = selectedCourse.course;
    const candidates: MaskedCandidate[] = [];
    const typeInfo = this.detectCourseTypes(course);

    // Handle standalone lab courses
    if (typeInfo.isStandaloneLab) {
      const labs = course.standaloneLabs || [];

      for (const lab of labs) {
        if (!this.isValidSection(lab, blockedMasksByTerm, selectedCourse)) continue;

        const mask = sectionToMask(lab);
        const candidate: MaskedCandidate = {
          combination: { lecture: null, discussion: null, lab },
          mask,
          term: lab.computedTerm
        };

        candidates.push(candidate);
      }

      return candidates;
    }

    // Handle hierarchical courses with lectures
    if (!course.lectures || course.lectures.length === 0) {
      return candidates;
    }

    for (const lectureGroup of course.lectures) {
      const lecture = lectureGroup.section;
      if (!this.isValidSection(lecture, blockedMasksByTerm, selectedCourse)) continue;

      const lectureMask = sectionToMask(lecture);

      // Get valid discussion candidates - must be same term as lecture
      const discussionCandidates: Array<{ section: Section | null; mask: bigint }> = [];
      if (typeInfo.hasDiscussions) {
        const discussions = lectureGroup.compatibleDiscussions || [];

        for (const d of discussions) {
          if (d.computedTerm !== lecture.computedTerm) continue;
          if (!this.isValidSection(d, blockedMasksByTerm, selectedCourse)) continue;
          const mask = sectionToMask(d);
          if (masksConflict(lectureMask, mask)) continue;
          discussionCandidates.push({ section: d, mask });
        }
      } else {
        discussionCandidates.push({ section: null, mask: 0n });
      }

      // Get valid lab candidates - must be same term as lecture
      const labCandidates: Array<{ section: Section | null; mask: bigint }> = [];
      if (typeInfo.hasLabs) {
        const labs = lectureGroup.compatibleLabs || [];

        for (const l of labs) {
          if (l.computedTerm !== lecture.computedTerm) continue;
          if (!this.isValidSection(l, blockedMasksByTerm, selectedCourse)) continue;
          const mask = sectionToMask(l);
          if (masksConflict(lectureMask, mask)) continue;
          labCandidates.push({ section: l, mask });
        }
      } else {
        labCandidates.push({ section: null, mask: 0n });
      }

      if (discussionCandidates.length === 0 || labCandidates.length === 0) continue;

      // Generate all valid combinations with precomputed masks
      for (const disc of discussionCandidates) {
        for (const lab of labCandidates) {
          if (disc.section && lab.section && masksConflict(disc.mask, lab.mask)) continue;

          const combinedMask = lectureMask | disc.mask | lab.mask;
          const candidate: MaskedCandidate = {
            combination: { lecture, discussion: disc.section, lab: lab.section },
            mask: combinedMask,
            term: lecture.computedTerm
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
    selectedCourse: SelectedCourse
  ): boolean {
    if (!this.hasValidTimeSlot(section)) return false;

    // Check blocked time conflict using bitmask - O(1)
    const sectionMask = sectionToMask(section);
    let blockedMask: bigint;
    if (section.computedTerm === 'F') {
      blockedMask = (blockedMasksByTerm.get('A') || 0n) | (blockedMasksByTerm.get('B') || 0n);
    } else if (section.computedTerm === 'S') {
      blockedMask = (blockedMasksByTerm.get('C') || 0n) | (blockedMasksByTerm.get('D') || 0n);
    } else {
      blockedMask = blockedMasksByTerm.get(section.computedTerm) || 0n;
    }
    if (masksConflict(sectionMask, blockedMask)) return false;

    // Check schedule filters
    return this.sectionPassesFilters(section, selectedCourse);
  }

  /**
   * Convert a section combination to a combined bitmask
   */
  private combinationToMask(combo: SectionCombination): bigint {
    let mask = 0n;
    if (combo.lecture) mask |= sectionToMask(combo.lecture);
    if (combo.discussion) mask |= sectionToMask(combo.discussion);
    if (combo.lab) mask |= sectionToMask(combo.lab);
    return mask;
  }

  /**
   * Get the term of a section combination
   */
  private getCombinationTerm(combo: SectionCombination): string | null {
    return combo.lecture?.computedTerm ||
           combo.discussion?.computedTerm ||
           combo.lab?.computedTerm ||
           null;
  }

  /**
   * Get a locked combination if all required components are locked.
   */
  private getLockedCombination(selectedCourse: SelectedCourse): SectionCombination | null {
    const lockedSections = selectedCourse.lockedSections || new Set();
    const typeInfo = this.detectCourseTypes(selectedCourse.course);

    let lockedLecture: Section | null = null;
    let lockedDiscussion: Section | null = null;
    let lockedLab: Section | null = null;

    if (selectedCourse.selectedLecture && lockedSections.has(String(selectedCourse.selectedLecture.crn))) {
      lockedLecture = selectedCourse.selectedLecture;
    }

    if (selectedCourse.selectedDiscussion && lockedSections.has(String(selectedCourse.selectedDiscussion.crn))) {
      lockedDiscussion = selectedCourse.selectedDiscussion;
    }

    if (selectedCourse.selectedLab && lockedSections.has(String(selectedCourse.selectedLab.crn))) {
      lockedLab = selectedCourse.selectedLab;
    }

    const hasAllRequired =
      (!typeInfo.hasLectures || lockedLecture !== null) &&
      (!typeInfo.hasDiscussions || lockedDiscussion !== null) &&
      (!typeInfo.hasLabs || lockedLab !== null);

    if (hasAllRequired) {
      return { lecture: lockedLecture, discussion: lockedDiscussion, lab: lockedLab };
    }

    return null;
  }

  /**
   * Detect what types of sections a course has.
   */
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

    const isStandaloneLab = !hasLectures && !!(course.standaloneLabs?.length);
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

      const hasTime = period.startTime.hours !== period.endTime.hours ||
             period.startTime.minutes !== period.endTime.minutes;
      const hasDays = period.days?.size > 0;
      return hasTime && hasDays;
    });
  }

  /**
   * Check if a section passes schedule filters.
   */
  private sectionPassesFilters(section: Section, selectedCourse: SelectedCourse): boolean {
    if (!this.hasValidTimeSlot(section)) return false;

    const filteredSections = this.scheduleFilterService.filterSections([selectedCourse]);
    return filteredSections.some(fs => fs.section.crn === section.crn);
  }
}
