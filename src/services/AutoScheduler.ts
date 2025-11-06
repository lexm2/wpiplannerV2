import type { Course, Section } from '../types/types';
import type { SelectedCourse, ScheduleScore, ScoreWeights, SchedulePreferences } from '../types/schedule';
import { TimeSlotMap } from '../core/TimeSlotMap';
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

interface CourseTypeInfo {
  hasLectures: boolean;
  hasDiscussions: boolean;
  hasLabs: boolean;
  isStandaloneLab: boolean;
}

const MAX_COMBINATIONS_WARNING = 100000;

export class AutoScheduler {
  private timeSlotMap: TimeSlotMap;

  constructor(private scheduleFilterService: ScheduleFilterService) {
    this.timeSlotMap = new TimeSlotMap();
  }

  generateSchedule(selectedCourses: SelectedCourse[]): ScheduleResult[] | null {
    const allSchedules = this.generateAllSchedules(selectedCourses, 1);
    return allSchedules.length > 0 ? allSchedules[0] : null;
  }

  generateAllSchedules(
    selectedCourses: SelectedCourse[],
    maxResults: number = 1000,
    timeoutMs: number = 5000
  ): ScheduleResult[][] {
    if (selectedCourses.length === 0) {
      return [];
    }

    const startTime = Date.now();

    const lockedSections: ScheduleResult[] = [];
    const incompleteCourses: SelectedCourse[] = [];

    for (const selectedCourse of selectedCourses) {
      const lockedCombination = this.getLockedCombination(selectedCourse);
      if (lockedCombination) {
        lockedSections.push({
          course: selectedCourse.course,
          combination: lockedCombination,
          isLocked: true
        });
      } else {
        incompleteCourses.push(selectedCourse);
      }
    }

    if (incompleteCourses.length === 0) {
      return [lockedSections];
    }

    console.log(`Auto-scheduler: ${lockedSections.length} locked, ${incompleteCourses.length} incomplete courses`);

    const candidatesPerCourse: Map<Course, SectionCombination[]> = new Map();
    let totalCombinations = 1;

    for (const selectedCourse of incompleteCourses) {
      const candidates = this.getCandidateCombinations(selectedCourse);

      if (candidates.length === 0) {
        console.warn(`No valid candidates for ${selectedCourse.course.department.abbreviation}${selectedCourse.course.number}`);
        return [];
      }

      candidatesPerCourse.set(selectedCourse.course, candidates);
      totalCombinations *= candidates.length;
    }

    if (totalCombinations > MAX_COMBINATIONS_WARNING) {
      console.warn(`Warning: ${totalCombinations} possible combinations. This may take a while...`);
      console.warn(`Consider adding more filters or locking some sections to reduce the search space.`);
    }

    this.timeSlotMap.clear();
    const allSections = this.getAllSectionsFromCandidates(candidatesPerCourse);
    for (const section of allSections) {
      this.timeSlotMap.addSection(section);
    }

    const overlaps = this.buildOverlapMap(allSections);
    console.log(`Built overlap map: ${overlaps.size} section pairs have conflicts`);

    const cartesianProduct = this.generateCartesianProduct(
      incompleteCourses,
      candidatesPerCourse,
      maxResults * 10
    );

    console.log(`Generated ${cartesianProduct.length} combinations (before conflict filtering)`);

    const validSchedules: ScheduleResult[][] = [];

    for (const combo of cartesianProduct) {
      if (Date.now() - startTime > timeoutMs) {
        console.warn(`Timeout after ${timeoutMs}ms - returning ${validSchedules.length} schedules`);
        break;
      }

      if (validSchedules.length >= maxResults) {
        break;
      }

      const fullSchedule = [...lockedSections, ...combo];

      if (this.isValidScheduleUsingOverlapMap(fullSchedule, overlaps)) {
        validSchedules.push(fullSchedule);
      }
    }

    console.log(`Found ${validSchedules.length} valid conflict-free schedules`);

    return validSchedules;
  }

  private getLockedCombination(selectedCourse: SelectedCourse): SectionCombination | null {
    const lockedSections = selectedCourse.lockedSections || new Set();
    const typeInfo = this.detectCourseTypes(selectedCourse.course);

    let lectureCount = 0;
    let discussionCount = 0;
    let labCount = 0;

    let lockedLecture: Section | null = null;
    let lockedDiscussion: Section | null = null;
    let lockedLab: Section | null = null;

    if (selectedCourse.selectedLecture && lockedSections.has(String(selectedCourse.selectedLecture.crn))) {
      lockedLecture = selectedCourse.selectedLecture;
      lectureCount = 1;
    }

    if (selectedCourse.selectedDiscussion && lockedSections.has(String(selectedCourse.selectedDiscussion.crn))) {
      lockedDiscussion = selectedCourse.selectedDiscussion;
      discussionCount = 1;
    }

    if (selectedCourse.selectedLab && lockedSections.has(String(selectedCourse.selectedLab.crn))) {
      lockedLab = selectedCourse.selectedLab;
      labCount = 1;
    }

    const hasAllRequired =
      (!typeInfo.hasLectures || lectureCount === 1) &&
      (!typeInfo.hasDiscussions || discussionCount === 1) &&
      (!typeInfo.hasLabs || labCount === 1);

    if (hasAllRequired) {
      return {
        lecture: lockedLecture,
        discussion: lockedDiscussion,
        lab: lockedLab
      };
    }

    return null;
  }

  private detectCourseTypes(course: Course): CourseTypeInfo {
    let hasLectures = false;
    let hasDiscussions = false;
    let hasLabs = false;

    if (course.lectures && course.lectures.length > 0) {
      hasLectures = true;

      for (const lectureGroup of course.lectures) {
        if (lectureGroup.compatibleDiscussions && lectureGroup.compatibleDiscussions.length > 0) {
          hasDiscussions = true;
        }
        if (lectureGroup.compatibleLabs && lectureGroup.compatibleLabs.length > 0) {
          hasLabs = true;
        }
      }
    }

    const isStandaloneLab = !hasLectures && !!(course.standaloneLabs && course.standaloneLabs.length > 0);
    if (isStandaloneLab) {
      hasLabs = true;
    }

    return { hasLectures, hasDiscussions, hasLabs, isStandaloneLab };
  }

  private getCandidateCombinations(selectedCourse: SelectedCourse): SectionCombination[] {
    const course = selectedCourse.course;
    const lockedSections = selectedCourse.lockedSections || new Set();
    const candidates: SectionCombination[] = [];

    const typeInfo = this.detectCourseTypes(course);

    if (typeInfo.isStandaloneLab) {
      const labCandidates = (course.standaloneLabs || [])
        .filter(lab => this.hasValidTimeSlot(lab) && this.sectionPassesFilters(lab, selectedCourse));

      for (const lab of labCandidates) {
        if (lockedSections.has(String(lab.crn)) || !selectedCourse.selectedLab) {
          if (lockedSections.has(String(lab.crn)) || !selectedCourse.selectedLab || selectedCourse.selectedLab.crn === lab.crn) {
            candidates.push({ lecture: null, discussion: null, lab });
          }
        } else {
          candidates.push({ lecture: null, discussion: null, lab });
        }
      }

      return candidates;
    }

    if (!course.lectures || course.lectures.length === 0) {
      return candidates;
    }

    for (const lectureGroup of course.lectures) {
      const lecture = lectureGroup.section;

      if (!this.hasValidTimeSlot(lecture)) {
        continue;
      }

      const isLectureLocked = lockedSections.has(String(lecture.crn));
      const isLecturePreSelected = selectedCourse.selectedLecture && selectedCourse.selectedLecture.crn === lecture.crn;

      if (!isLectureLocked && !isLecturePreSelected) {
        if (selectedCourse.selectedLecture) {
          continue;
        }
        if (!this.sectionPassesFilters(lecture, selectedCourse)) {
          continue;
        }
      }

      const discussionCandidates: (Section | null)[] = [];
      const labCandidates: (Section | null)[] = [];

      if (typeInfo.hasDiscussions) {
        const discussions = (lectureGroup.compatibleDiscussions || [])
          .filter(d => this.hasValidTimeSlot(d) && this.sectionPassesFilters(d, selectedCourse));

        for (const discussion of discussions) {
          const isDiscussionLocked = lockedSections.has(String(discussion.crn));
          const isDiscussionPreSelected = selectedCourse.selectedDiscussion && selectedCourse.selectedDiscussion.crn === discussion.crn;

          if (isDiscussionLocked || isDiscussionPreSelected || !selectedCourse.selectedDiscussion) {
            discussionCandidates.push(discussion);
          }
        }
      } else {
        discussionCandidates.push(null);
      }

      if (typeInfo.hasLabs) {
        const labs = (lectureGroup.compatibleLabs || [])
          .filter(l => this.hasValidTimeSlot(l) && this.sectionPassesFilters(l, selectedCourse));

        for (const lab of labs) {
          const isLabLocked = lockedSections.has(String(lab.crn));
          const isLabPreSelected = selectedCourse.selectedLab && selectedCourse.selectedLab.crn === lab.crn;

          if (isLabLocked || isLabPreSelected || !selectedCourse.selectedLab) {
            labCandidates.push(lab);
          }
        }
      } else {
        labCandidates.push(null);
      }

      for (const discussion of discussionCandidates) {
        for (const lab of labCandidates) {
          candidates.push({ lecture, discussion, lab });
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
    if (!section.periods || section.periods.length === 0) {
      return false;
    }

    return section.periods.some(period => {
      const hasTime = period.startTime.hours !== period.endTime.hours ||
             period.startTime.minutes !== period.endTime.minutes;
      const hasDays = period.days && period.days.size > 0;
      return hasTime && hasDays;
    });
  }

  private getAllSectionsFromCandidates(candidatesPerCourse: Map<Course, SectionCombination[]>): Section[] {
    const allSections: Section[] = [];
    const seen = new Set<string>();

    for (const combinations of candidatesPerCourse.values()) {
      for (const combo of combinations) {
        if (combo.lecture && !seen.has(String(combo.lecture.crn))) {
          allSections.push(combo.lecture);
          seen.add(String(combo.lecture.crn));
        }
        if (combo.discussion && !seen.has(String(combo.discussion.crn))) {
          allSections.push(combo.discussion);
          seen.add(String(combo.discussion.crn));
        }
        if (combo.lab && !seen.has(String(combo.lab.crn))) {
          allSections.push(combo.lab);
          seen.add(String(combo.lab.crn));
        }
      }
    }

    return allSections;
  }

  private buildOverlapMap(sections: Section[]): Map<string, Set<string>> {
    const overlaps = new Map<string, Set<string>>();

    for (let i = 0; i < sections.length; i++) {
      for (let j = i + 1; j < sections.length; j++) {
        const section1 = sections[i];
        const section2 = sections[j];

        if (this.timeSlotMap.hasOverlap(section1, section2)) {
          const key1 = String(section1.crn);
          const key2 = String(section2.crn);

          if (!overlaps.has(key1)) {
            overlaps.set(key1, new Set());
          }
          overlaps.get(key1)!.add(key2);

          if (!overlaps.has(key2)) {
            overlaps.set(key2, new Set());
          }
          overlaps.get(key2)!.add(key1);
        }
      }
    }

    return overlaps;
  }

  private generateCartesianProduct(
    courses: SelectedCourse[],
    candidatesPerCourse: Map<Course, SectionCombination[]>,
    maxCombinations: number
  ): ScheduleResult[][] {
    const results: ScheduleResult[][] = [];

    const courseList = courses.map(sc => sc.course);
    const candidateLists = courseList.map(course => candidatesPerCourse.get(course) || []);

    const indices = new Array(courseList.length).fill(0);

    while (true) {
      if (results.length >= maxCombinations) {
        console.warn(`Reached max combinations limit of ${maxCombinations}`);
        break;
      }

      const combo: ScheduleResult[] = [];
      for (let i = 0; i < courseList.length; i++) {
        combo.push({
          course: courseList[i],
          combination: candidateLists[i][indices[i]]
        });
      }
      results.push(combo);

      let carry = 1;
      for (let i = courseList.length - 1; i >= 0 && carry; i--) {
        indices[i] += carry;
        if (indices[i] >= candidateLists[i].length) {
          indices[i] = 0;
          carry = 1;
        } else {
          carry = 0;
        }
      }

      if (carry) {
        break;
      }
    }

    return results;
  }

  private isValidScheduleUsingOverlapMap(
    schedule: ScheduleResult[],
    overlaps: Map<string, Set<string>>
  ): boolean {
    const crns: string[] = [];

    for (const result of schedule) {
      if (result.combination.lecture) {
        crns.push(String(result.combination.lecture.crn));
      }
      if (result.combination.discussion) {
        crns.push(String(result.combination.discussion.crn));
      }
      if (result.combination.lab) {
        crns.push(String(result.combination.lab.crn));
      }
    }

    for (let i = 0; i < crns.length; i++) {
      for (let j = i + 1; j < crns.length; j++) {
        const crn1 = crns[i];
        const crn2 = crns[j];

        if (overlaps.has(crn1) && overlaps.get(crn1)!.has(crn2)) {
          return false;
        }
      }
    }

    return true;
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
