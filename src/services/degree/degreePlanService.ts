import { appState } from '../../core/state/appState.svelte';
import { setPage, showAppError } from '../ui/uiState.svelte';
import type { ProfileStateManager } from '../../core/state/ProfileStateManager';
import type { FilterService } from '../filtering/FilterService';
import { inferBucketDepartments, type DegreeBucket } from './degreeBuckets';
import { getDegreeBucketCriteria } from './degreeBucketRules';
import { findCatalogCourse } from './catalogLookup';
import { degreeState } from '../../svelte/degree/degreeState.svelte';
import { courseListState } from '../../svelte/courseListState.svelte';

/**
 * Navigation out of the Degree page and into the planner: browsing for a bucket
 * and opening a degree course's catalog entry. Dependencies are injected once
 * via init(), matching the other standalone scheduling services.
 */
class DegreePlanService {
  private profileStateManager: ProfileStateManager | null = null;
  private filterService: FilterService | null = null;

  init(
    profileStateManager: ProfileStateManager,
    filterService: FilterService,
  ): void {
    this.profileStateManager = profileStateManager;
    this.filterService = filterService;
  }

  /**
   * From an empty bucket slot: filter the courses page to the departments that
   * give credit for the bucket (+ the active academic year) and navigate there
   * so the user can pick a course.
   */
  browseForBucket(bucket: DegreeBucket): void {
    if (!this.filterService) return;

    // Imported buckets prefer the tracking-sheet rules (valid departments +
    // excluded courses) via the backend-only degreeBucket filter. Custom buckets
    // have no sheet rule, so they take the department path below.
    const record = degreeState.record;
    const classYear = record?.startYear != null ? record.startYear + 4 : null;
    const bucketCriteria =
      record && bucket.source === 'import'
        ? getDegreeBucketCriteria(
            record.major,
            classYear,
            bucket.category,
            bucket.name,
          )
        : null;

    if (bucketCriteria) {
      this.filterService.addFilter('degreeBucket', bucketCriteria);
      this.filterService.removeFilter('department');
    } else {
      this.filterService.removeFilter('degreeBucket');
      const depts = inferBucketDepartments(bucket, appState.loadedDepartments);
      if (depts.length) {
        this.filterService.addFilter('department', { departments: depts });
      } else {
        this.filterService.removeFilter('department');
      }
    }

    const year =
      appState.activeSchedule?.year ??
      this.profileStateManager?.getDefaultAcademicYear();
    if (year !== undefined) {
      this.filterService.addFilter('academicYear', { year });
    }

    setPage('planner');
  }

  /**
   * Open a degree course's catalog entry on the classes (planner) page: resolve
   * the linked Course, surface it (search + year filter), select it so the
   * detail panel shows it, and scroll its list entry into view. If the catalog
   * has no such course, alert and do nothing else.
   */
  openCourse(code: string, year: number | null): void {
    const preferredYear =
      year ??
      appState.activeSchedule?.year ??
      this.profileStateManager?.getDefaultAcademicYear() ??
      null;
    const course = findCatalogCourse(
      code,
      preferredYear,
      appState.loadedDepartments,
    );

    if (!course) {
      if (typeof alert === 'function')
        showAppError(`${code} could not be found in the course catalog.`);
      return;
    }

    if (this.filterService) {
      this.filterService.addFilter('searchText', {
        query: `${course.departmentAbbr}${course.number}`,
      });
      if (course.academicYear !== undefined) {
        this.filterService.addFilter('academicYear', {
          year: course.academicYear,
        });
      }
    }

    courseListState.selectedCourse = course;
    setPage('planner');
    scrollCourseIntoView(course.id);
  }
}

/** Best-effort scroll of a course's list entry into view once the planner renders it. */
function scrollCourseIntoView(courseId: string): void {
  if (
    typeof document === 'undefined' ||
    typeof requestAnimationFrame !== 'function'
  )
    return;
  const selector = `#course-container [data-course-id="${typeof CSS !== 'undefined' ? CSS.escape(courseId) : courseId}"]`;
  let tries = 0;
  const tick = () => {
    const el = document.querySelector(selector);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (tries++ < 12) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export const degreePlanService = new DegreePlanService();
