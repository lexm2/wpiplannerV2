import type {
  ScheduleDB,
  Department,
  Course,
  Section,
  LectureGroup,
} from '../../types/types';
import type { RawCourse } from '../../types/rawData';
import { appState } from '../../core/state/appState.svelte';
import { logger } from '../../utils/logger';
import { parseCatalog, parseCourse } from './parseCatalog';

/**
 * Fetches the WPI course catalog and parses it with parseCatalog.
 * Publishes the catalog by reassigning `appState.loadedDepartments`; consumers react to that.
 */
export class CourseDataService {
  private static readonly WPI_COURSE_DATA_URL =
    './course-data-constructed.json';
  private scheduleDB: ScheduleDB | null = null;
  // Started by prefetchCourseData(), consumed by the next loadCourseData().
  private prefetched: Promise<ScheduleDB> | null = null;

  constructor() {}

  /**
   * Starts the fetch + parse without publishing anything, so the download
   * overlaps the rest of startup. loadCourseData() picks up the result; a
   * failure stays parked until then and surfaces there, as if it had fetched.
   */
  prefetchCourseData(): void {
    if (this.prefetched) return;
    const pending = this.fetchFreshData();
    // Marks the rejection handled for the window between now and the await in
    // loadCourseData() (or forever, if an earlier startup step throws first).
    pending.catch(() => {});
    this.prefetched = pending;
  }

  async loadCourseData(): Promise<ScheduleDB> {
    try {
      const pending = this.prefetched ?? this.fetchFreshData();
      this.prefetched = null;
      const freshData = await pending;
      this.scheduleDB = freshData;

      appState.loadedDepartments = freshData.departments;

      return freshData;
    } catch (error) {
      logger.error('Failed to load course data:', error);
      throw new Error('No course data available', { cause: error });
    }
  }

  private async fetchFreshData(): Promise<ScheduleDB> {
    const response = await fetch(CourseDataService.WPI_COURSE_DATA_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-cache',
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch course data: ${response.status} ${response.statusText}`,
      );
    }

    return parseCatalog(await response.json());
  }

  getAllDepartments(): Department[] {
    return this.scheduleDB?.departments || [];
  }

  /** Empty if the course is lab-only. */
  getLecturesForCourse(course: Course): LectureGroup[] {
    return course.lectures || [];
  }

  getDiscussionsForLecture(course: Course, lectureSection: Section): Section[] {
    if (!course.lectures) return [];

    const lectureGroup = course.lectures.find(
      lg => lg.section.crn === lectureSection.crn,
    );
    return lectureGroup?.compatibleDiscussions ?? [];
  }

  getLabsForLecture(course: Course, lectureSection: Section): Section[] {
    if (!course.lectures) return [];

    const lectureGroup = course.lectures.find(
      lg => lg.section.crn === lectureSection.crn,
    );
    return lectureGroup?.compatibleLabs ?? [];
  }

  /** Empty if the course has lectures or no standalone labs. */
  getStandaloneLabs(course: Course): Section[] {
    return course.standaloneLabs || [];
  }

  /** True if the course has lecture groups (vs. flat/standalone-lab structure). */
  isHierarchicalCourse(course: Course): boolean {
    return (course.lectures && course.lectures.length > 0) || false;
  }

  /** Lab-only: no lectures, only standalone labs. */
  isLabOnlyCourse(course: Course): boolean {
    return (
      ((!course.lectures || course.lectures.length === 0) &&
        course.standaloneLabs &&
        course.standaloneLabs.length > 0) ||
      false
    );
  }

  filterDepartments(predicate: (d: Department) => boolean): void {
    if (!this.scheduleDB) return;
    this.scheduleDB = {
      ...this.scheduleDB,
      departments: this.scheduleDB.departments.filter(predicate),
    };
    this.notifyDataRefreshed();
  }

  async addTutorialDepartment(): Promise<void> {
    if (!this.scheduleDB) return;
    const response = await fetch('./tutorial-courses.json', {
      cache: 'no-cache',
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch tutorial courses: ${response.status} ${response.statusText}`,
      );
    }
    const json = (await response.json()) as { courses: RawCourse[] };
    const tutorial = { abbreviation: 'TUT', name: 'Tutorial' };
    const parsedCourses = json.courses.map(raw => ({
      ...parseCourse(raw, tutorial),
      transient: true,
    }));
    const tutDept: Department = { ...tutorial, courses: parsedCourses };
    this.scheduleDB = {
      ...this.scheduleDB,
      departments: [
        tutDept,
        ...this.scheduleDB.departments.filter(d => d.abbreviation !== 'TUT'),
      ],
    };
    this.notifyDataRefreshed();
  }

  notifyDataRefreshed(): void {
    if (!this.scheduleDB) {
      logger.warn('[CourseDataService] Cannot notify refresh - no data loaded');
      return;
    }

    appState.loadedDepartments = this.scheduleDB.departments;
  }
}
