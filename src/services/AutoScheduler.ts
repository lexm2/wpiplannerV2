import type { Course, Section } from '../types/types';
import type { SelectedCourse } from '../types/schedule';
import { ConflictDetector } from '../core/ConflictDetector';
import type { ScheduleFilterService } from './ScheduleFilterService';

interface SectionCombination {
  lecture: Section | null;
  discussion: Section | null;
  lab: Section | null;
}

interface ScheduleResult {
  course: Course;
  combination: SectionCombination;
  isLocked?: boolean;
}

export class AutoScheduler {
  private conflictDetector: ConflictDetector;

  constructor(private scheduleFilterService: ScheduleFilterService) {
    this.conflictDetector = new ConflictDetector();
  }

  generateSchedule(selectedCourses: SelectedCourse[]): ScheduleResult[] | null {
    if (selectedCourses.length === 0) {
      return [];
    }

    const lockedCourses: ScheduleResult[] = [];
    const incompleteCourses: SelectedCourse[] = [];

    for (const selectedCourse of selectedCourses) {
      if (this.hasCompleteSelection(selectedCourse)) {
        lockedCourses.push({
          course: selectedCourse.course,
          combination: {
            lecture: selectedCourse.selectedLecture,
            discussion: selectedCourse.selectedDiscussion,
            lab: selectedCourse.selectedLab
          },
          isLocked: true
        });
      } else {
        incompleteCourses.push(selectedCourse);
      }
    }

    if (incompleteCourses.length === 0) {
      return lockedCourses;
    }

    const candidatesPerCourse: Map<Course, SectionCombination[]> = new Map();

    for (const selectedCourse of incompleteCourses) {
      const candidates = this.getCandidateCombinations(selectedCourse);

      if (candidates.length === 0) {
        return null;
      }

      candidatesPerCourse.set(selectedCourse.course, candidates);
    }

    const courses = Array.from(candidatesPerCourse.keys());
    const result: ScheduleResult[] = [...lockedCourses];

    if (this.backtrack(0, courses, candidatesPerCourse, result)) {
      return result;
    }

    return null;
  }

  private hasCompleteSelection(selectedCourse: SelectedCourse): boolean {
    const course = selectedCourse.course;

    if (course.standaloneLabs && course.standaloneLabs.length > 0) {
      return selectedCourse.selectedLab !== null;
    }

    if (!course.lectures || course.lectures.length === 0) {
      return false;
    }

    if (!selectedCourse.selectedLecture) {
      return false;
    }

    const lectureGroup = course.lectures.find(
      lg => lg.section.crn === selectedCourse.selectedLecture?.crn
    );

    if (!lectureGroup) {
      return false;
    }

    const hasDiscussions = lectureGroup.compatibleDiscussions && lectureGroup.compatibleDiscussions.length > 0;
    const hasLabs = lectureGroup.compatibleLabs && lectureGroup.compatibleLabs.length > 0;

    if (hasDiscussions && !selectedCourse.selectedDiscussion) {
      return false;
    }

    if (hasLabs && !selectedCourse.selectedLab) {
      return false;
    }

    return true;
  }

  private backtrack(
    courseIndex: number,
    courses: Course[],
    candidatesPerCourse: Map<Course, SectionCombination[]>,
    currentSelection: ScheduleResult[]
  ): boolean {
    if (courseIndex === courses.length) {
      return this.isValidSchedule(currentSelection);
    }

    const course = courses[courseIndex];
    const candidates = candidatesPerCourse.get(course) || [];

    for (const combination of candidates) {
      currentSelection.push({ course, combination });

      if (!this.hasConflictsInCurrentSelection(currentSelection)) {
        if (this.backtrack(courseIndex + 1, courses, candidatesPerCourse, currentSelection)) {
          return true;
        }
      }

      currentSelection.pop();
    }

    return false;
  }

  private getCandidateCombinations(selectedCourse: SelectedCourse): SectionCombination[] {
    const course = selectedCourse.course;
    const candidates: SectionCombination[] = [];

    if (course.standaloneLabs && course.standaloneLabs.length > 0) {
      if (selectedCourse.selectedLab) {
        candidates.push({ lecture: null, discussion: null, lab: selectedCourse.selectedLab });
      } else {
        for (const lab of course.standaloneLabs) {
          if (this.sectionPassesFilters(lab, selectedCourse)) {
            candidates.push({ lecture: null, discussion: null, lab });
          }
        }
      }
      return candidates;
    }

    if (!course.lectures || course.lectures.length === 0) {
      return candidates;
    }

    const lectureGroups = selectedCourse.selectedLecture
      ? course.lectures.filter(lg => lg.section.crn === selectedCourse.selectedLecture?.crn)
      : course.lectures;

    for (const lectureGroup of lectureGroups) {
      const lecture = lectureGroup.section;

      if (!selectedCourse.selectedLecture && !this.sectionPassesFilters(lecture, selectedCourse)) {
        continue;
      }

      const discussions = lectureGroup.compatibleDiscussions || [];
      const labs = lectureGroup.compatibleLabs || [];

      const discussionCandidates = selectedCourse.selectedDiscussion
        ? [selectedCourse.selectedDiscussion]
        : discussions.filter(d => this.sectionPassesFilters(d, selectedCourse));

      const labCandidates = selectedCourse.selectedLab
        ? [selectedCourse.selectedLab]
        : labs.filter(l => this.sectionPassesFilters(l, selectedCourse));

      if (discussionCandidates.length === 0 && labCandidates.length === 0) {
        candidates.push({ lecture, discussion: null, lab: null });
      } else if (discussionCandidates.length === 0 && labCandidates.length > 0) {
        for (const lab of labCandidates) {
          candidates.push({ lecture, discussion: null, lab });
        }
        if (!selectedCourse.selectedLab && labs.length > 0) {
          candidates.push({ lecture, discussion: null, lab: null });
        }
      } else if (discussionCandidates.length > 0 && labCandidates.length === 0) {
        for (const discussion of discussionCandidates) {
          candidates.push({ lecture, discussion, lab: null });
        }
        if (!selectedCourse.selectedDiscussion && discussions.length > 0) {
          candidates.push({ lecture, discussion: null, lab: null });
        }
      } else {
        for (const discussion of discussionCandidates) {
          for (const lab of labCandidates) {
            candidates.push({ lecture, discussion, lab });
          }
          if (!selectedCourse.selectedLab && labs.length > 0) {
            candidates.push({ lecture, discussion, lab: null });
          }
        }

        if (!selectedCourse.selectedDiscussion && discussions.length > 0) {
          for (const lab of labCandidates) {
            candidates.push({ lecture, discussion: null, lab });
          }
          if (!selectedCourse.selectedLab && labs.length > 0) {
            candidates.push({ lecture, discussion: null, lab: null });
          }
        }
      }
    }

    return candidates;
  }

  private sectionPassesFilters(section: Section, selectedCourse: SelectedCourse): boolean {
    const filteredSections = this.scheduleFilterService.filterSections([selectedCourse]);

    return filteredSections.some(
      fs => fs.section.crn === section.crn
    );
  }

  private hasConflictsInCurrentSelection(currentSelection: ScheduleResult[]): boolean {
    const allSections: Section[] = [];

    for (const result of currentSelection) {
      if (result.combination.lecture) {
        allSections.push(result.combination.lecture);
      }
      if (result.combination.discussion) {
        allSections.push(result.combination.discussion);
      }
      if (result.combination.lab) {
        allSections.push(result.combination.lab);
      }
    }

    return !this.conflictDetector.isValidSchedule(allSections);
  }

  private isValidSchedule(schedule: ScheduleResult[]): boolean {
    const allSections: Section[] = [];

    for (const result of schedule) {
      if (result.combination.lecture) {
        allSections.push(result.combination.lecture);
      }
      if (result.combination.discussion) {
        allSections.push(result.combination.discussion);
      }
      if (result.combination.lab) {
        allSections.push(result.combination.lab);
      }
    }

    return this.conflictDetector.isValidSchedule(allSections);
  }
}
