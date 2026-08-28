import type { Course, Section, LectureGroup } from '../../types/types';
import { SectionType } from '../../types/types';
import type { FilterableSection } from '../../types/filterableUnit';
import { FilterPriorityQueue } from './FilterPriorityQueue';

export interface SectionBasedFilter {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priority: number;

  apply(
    sections: FilterableSection[],
    criteria: unknown,
    activeFilters?: Map<string, unknown>,
  ): FilterableSection[];
  isValidCriteria(criteria: unknown): boolean;
  getDisplayValue(criteria: unknown): string;
}

type ActiveSectionFilter = {
  id: string;
  filter: SectionBasedFilter;
  criteria: unknown;
};

interface ReconstructedLectureGroup {
  section: Section;
  discussions: Section[];
  labs: Section[];
}

interface ReconstructedCourse {
  course: Course;
  lectureGroups: Map<string, ReconstructedLectureGroup>;
  standaloneLabs: Section[];
}

export class SectionFilterPipeline {
  private registeredFilters = new Map<string, SectionBasedFilter>();

  registerFilter(filter: SectionBasedFilter): void {
    this.registeredFilters.set(filter.id, filter);
  }

  unregisterFilter(filterId: string): void {
    this.registeredFilters.delete(filterId);
  }

  flattenCoursesToSections(courses: Course[]): FilterableSection[] {
    const sections: FilterableSection[] = [];

    for (const course of courses) {
      if (course.lectures && course.lectures.length > 0) {
        for (const lectureGroup of course.lectures) {
          sections.push({
            course,
            section: lectureGroup.section,
            lectureGroup,
            sectionType: SectionType.LECTURE,
          });

          for (const discussion of lectureGroup.compatibleDiscussions) {
            sections.push({
              course,
              section: discussion,
              lectureGroup,
              sectionType: SectionType.DISCUSSION,
            });
          }

          for (const lab of lectureGroup.compatibleLabs) {
            sections.push({
              course,
              section: lab,
              lectureGroup,
              sectionType: SectionType.LAB,
            });
          }
        }
      }

      if (course.standaloneLabs && course.standaloneLabs.length > 0) {
        for (const lab of course.standaloneLabs) {
          sections.push({
            course,
            section: lab,
            sectionType: SectionType.STANDALONE_LAB,
          });
        }
      }
    }

    return sections;
  }

  reconstructCourses(filteredSections: FilterableSection[]): Course[] {
    const survivingLectureCrns = new Set<string>();
    const courseMap = new Map<string, ReconstructedCourse>();

    for (const fs of filteredSections) {
      const courseId = fs.course.id;

      if (!courseMap.has(courseId)) {
        courseMap.set(courseId, {
          course: fs.course,
          lectureGroups: new Map(),
          standaloneLabs: [],
        });
      }

      const courseData = courseMap.get(courseId);
      if (!courseData) continue;

      if (fs.sectionType === SectionType.LECTURE) {
        const lectureCrn = String(fs.section.crn);
        survivingLectureCrns.add(lectureCrn);
        if (!courseData.lectureGroups.has(lectureCrn)) {
          courseData.lectureGroups.set(lectureCrn, {
            section: fs.section,
            discussions: [],
            labs: [],
          });
        }
      } else if (fs.sectionType === SectionType.DISCUSSION && fs.lectureGroup) {
        const lectureCrn = String(fs.lectureGroup.section.crn);
        if (!courseData.lectureGroups.has(lectureCrn)) {
          courseData.lectureGroups.set(lectureCrn, {
            section: fs.lectureGroup.section,
            discussions: [],
            labs: [],
          });
        }
        const lectureData = courseData.lectureGroups.get(lectureCrn);
        if (
          lectureData &&
          !lectureData.discussions.find(d => d.crn === fs.section.crn)
        ) {
          lectureData.discussions.push(fs.section);
        }
      } else if (fs.sectionType === SectionType.LAB && fs.lectureGroup) {
        const lectureCrn = String(fs.lectureGroup.section.crn);
        if (!courseData.lectureGroups.has(lectureCrn)) {
          courseData.lectureGroups.set(lectureCrn, {
            section: fs.lectureGroup.section,
            discussions: [],
            labs: [],
          });
        }
        const lectureData = courseData.lectureGroups.get(lectureCrn);
        if (
          lectureData &&
          !lectureData.labs.find(l => l.crn === fs.section.crn)
        ) {
          lectureData.labs.push(fs.section);
        }
      } else if (fs.sectionType === SectionType.STANDALONE_LAB) {
        if (!courseData.standaloneLabs.find(l => l.crn === fs.section.crn)) {
          courseData.standaloneLabs.push(fs.section);
        }
      }
    }

    // Prune lecture groups where required components are missing
    for (const courseData of courseMap.values()) {
      const originalCourse = courseData.course;
      const prunedKeys: string[] = [];

      for (const [lectureCrn, lg] of courseData.lectureGroups) {
        if (!survivingLectureCrns.has(lectureCrn)) {
          prunedKeys.push(lectureCrn);
          continue;
        }

        const originalLg = originalCourse.lectures?.find(
          ol => String(ol.section.crn) === lectureCrn,
        );
        if (!originalLg) continue;

        if (originalLg.compatibleLabs.length > 0 && lg.labs.length === 0) {
          prunedKeys.push(lectureCrn);
          continue;
        }
        if (
          originalLg.compatibleDiscussions.length > 0 &&
          lg.discussions.length === 0
        ) {
          prunedKeys.push(lectureCrn);
        }
      }

      for (const key of prunedKeys) {
        courseData.lectureGroups.delete(key);
      }
    }

    const reconstructedCourses: Course[] = [];

    for (const courseData of courseMap.values()) {
      const originalCourse = courseData.course;
      const hadLectures =
        originalCourse.lectures && originalCourse.lectures.length > 0;
      const hadStandaloneLabs =
        originalCourse.standaloneLabs &&
        originalCourse.standaloneLabs.length > 0;

      const hasLectures = courseData.lectureGroups.size > 0;
      const hasStandaloneLabs = courseData.standaloneLabs.length > 0;

      // Skip course if all required component types were filtered out
      if (hadLectures && !hasLectures && !hasStandaloneLabs) continue;
      if (hadStandaloneLabs && !hasStandaloneLabs && !hasLectures) continue;

      const lectures: LectureGroup[] = Array.from(
        courseData.lectureGroups.values(),
      ).map(lg => ({
        section: lg.section,
        compatibleDiscussions: lg.discussions,
        compatibleLabs: lg.labs,
      }));

      reconstructedCourses.push({
        ...courseData.course,
        lectures: lectures.length > 0 ? lectures : undefined,
        standaloneLabs:
          courseData.standaloneLabs.length > 0
            ? courseData.standaloneLabs
            : undefined,
      });
    }

    return reconstructedCourses;
  }

  applyFilters(
    sections: FilterableSection[],
    activeFilters: Map<string, unknown>,
  ): FilterableSection[] {
    const filtersToApply: ActiveSectionFilter[] = [];

    for (const [filterId, criteria] of activeFilters.entries()) {
      const filter = this.registeredFilters.get(filterId);
      if (filter && filter.isValidCriteria(criteria)) {
        filtersToApply.push({ id: filterId, filter, criteria });
      }
    }

    const priorityQueue = new FilterPriorityQueue<ActiveSectionFilter>();
    for (const activeFilter of filtersToApply) {
      priorityQueue.insert(activeFilter, activeFilter.filter.priority);
    }

    let filteredSections = sections;

    while (!priorityQueue.isEmpty()) {
      const activeFilter = priorityQueue.extractMin();
      if (!activeFilter) break;
      filteredSections = activeFilter.filter.apply(
        filteredSections,
        activeFilter.criteria,
        activeFilters,
      );
    }

    return filteredSections;
  }
}
