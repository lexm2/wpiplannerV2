import type { Course, Section } from '../types/types';
import type { SelectedCourse, ScheduleScore, ScoreWeights, SchedulePreferences } from '../types/schedule';
import { ConflictDetector } from '../core/ConflictDetector';
import type { ScheduleFilterService } from './ScheduleFilterService';
import { ScheduleScorer } from './ScheduleScorer';

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

interface ScoredScheduleResult {
  schedule: ScheduleResult[];
  score: ScheduleScore;
  id: string;
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
    if (!this.hasValidTimeSlot(section)) {
      return false;
    }

    const filteredSections = this.scheduleFilterService.filterSections([selectedCourse]);

    return filteredSections.some(
      fs => fs.section.crn === section.crn
    );
  }

  private hasValidTimeSlot(section: Section): boolean {
    return section.periods.some(period => {
      return period.startTime.hours !== period.endTime.hours ||
             period.startTime.minutes !== period.endTime.minutes;
    });
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

  generateAllSchedules(
    selectedCourses: SelectedCourse[],
    maxResults: number = 1000,
    timeoutMs: number = 5000
  ): ScheduleResult[][] {
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
      return [lockedCourses];
    }

    const candidatesPerCourse: Map<Course, SectionCombination[]> = new Map();

    for (const selectedCourse of incompleteCourses) {
      const candidates = this.getCandidateCombinations(selectedCourse);

      if (candidates.length === 0) {
        return [];
      }

      candidatesPerCourse.set(selectedCourse.course, candidates);
    }

    const courses = Array.from(candidatesPerCourse.keys())
      .sort((a, b) => {
        const aCount = candidatesPerCourse.get(a)?.length || 0;
        const bCount = candidatesPerCourse.get(b)?.length || 0;
        return aCount - bCount;
      });

    const allSolutions: ScheduleResult[][] = [];
    const startTime = Date.now();

    this.backtrackAll(
      0,
      courses,
      candidatesPerCourse,
      [...lockedCourses],
      allSolutions,
      maxResults,
      startTime,
      timeoutMs
    );

    return allSolutions;
  }

  private backtrackAll(
    courseIndex: number,
    courses: Course[],
    candidatesPerCourse: Map<Course, SectionCombination[]>,
    currentSelection: ScheduleResult[],
    allSolutions: ScheduleResult[][],
    maxResults: number,
    startTime: number,
    timeoutMs: number
  ): void {
    if (allSolutions.length >= maxResults) {
      return;
    }

    if (Date.now() - startTime > timeoutMs) {
      console.warn(`Schedule generation timeout after ${timeoutMs}ms - returning ${allSolutions.length} schedules`);
      return;
    }

    if (courseIndex === courses.length) {
      if (this.isValidSchedule(currentSelection)) {
        allSolutions.push(currentSelection.map(sr => ({
          course: sr.course,
          combination: {
            lecture: sr.combination.lecture,
            discussion: sr.combination.discussion,
            lab: sr.combination.lab
          },
          isLocked: sr.isLocked
        })));
      }
      return;
    }

    const course = courses[courseIndex];
    const candidates = candidatesPerCourse.get(course) || [];

    for (const combination of candidates) {
      currentSelection.push({ course, combination });

      if (!this.hasConflictsInCurrentSelection(currentSelection)) {
        this.backtrackAll(
          courseIndex + 1,
          courses,
          candidatesPerCourse,
          currentSelection,
          allSolutions,
          maxResults,
          startTime,
          timeoutMs
        );
      }

      currentSelection.pop();
    }
  }

  generateBestSchedule(
    selectedCourses: SelectedCourse[],
    preferences: SchedulePreferences,
    weights?: ScoreWeights,
    maxResults: number = 1000
  ): ScheduleResult[] | null {
    const allSchedules = this.generateAllSchedules(selectedCourses, maxResults);

    if (allSchedules.length === 0) {
      return null;
    }

    const scorer = new ScheduleScorer();
    const scored = allSchedules.map((schedule, index) => ({
      schedule,
      score: scorer.calculateCompositeScore(schedule, preferences, weights),
      id: `schedule-${index}`
    }));

    scored.sort((a, b) => b.score.totalScore - a.score.totalScore);

    return scored[0].schedule;
  }

  generateScoredSchedules(
    selectedCourses: SelectedCourse[],
    preferences: SchedulePreferences,
    weights?: ScoreWeights,
    maxResults: number = 1000,
    topN: number = 10
  ): ScoredScheduleResult[] {
    const allSchedules = this.generateAllSchedules(selectedCourses, maxResults);

    if (allSchedules.length === 0) {
      return [];
    }

    const scorer = new ScheduleScorer();
    const scored = allSchedules.map((schedule, index) => ({
      schedule,
      score: scorer.calculateCompositeScore(schedule, preferences, weights),
      id: `schedule-${index}`
    }));

    return scored
      .sort((a, b) => b.score.totalScore - a.score.totalScore)
      .slice(0, topN);
  }
}
