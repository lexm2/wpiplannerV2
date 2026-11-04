import { appState } from '../../core/state/appState.svelte';
import { setPage, showAppError } from '../ui/uiState.svelte';
import type { ProfileStateManager } from '../../core/state/ProfileStateManager';
import type { FilterService } from '../filtering/FilterService';
import {
  bucketRuleLabel,
  inferBucketDepartments,
  type DegreeBucket,
} from './degreeBuckets';
import type { DegreeBucketFilterCriteria } from '../../types/filters';
import { getDegreeBucketCriteria } from './degreeBucketRules';
import { candidateCodes, findCatalogCourse } from './catalogLookup';
import { degreeState } from '../../svelte/degree/degreeState.svelte';
import { courseListState } from '../../svelte/courseListState.svelte';

/**
 * Navigation out of the Degree page and into the planner: browsing for a bucket,
 * opening a degree course's catalog entry, and searching the catalog for one.
 * Dependencies are injected once via init(), matching the other standalone
 * scheduling services.
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
   * From an empty bucket slot: filter the courses page to the courses that give
   * credit for the bucket (+ the active academic year), leaving out any already
   * taken or scheduled, and navigate there so the user can pick one.
   */
  browseForBucket(bucket: DegreeBucket): void {
    const rule = this.bucketRule(bucket);
    this.browse(
      rule
        ? {
            ...rule,
            excludedCourses: [...rule.excludedCourses, ...this.coveredCodes()],
            label: bucket.name,
          }
        : null,
    );
  }

  /**
   * What gives credit for a bucket. Imported buckets prefer the tracking-sheet
   * rule (valid departments + excluded courses, either possibly empty); custom
   * buckets, and imported ones the sheets lack, fall back to inferred
   * departments. null when there is neither.
   */
  private bucketRule(bucket: DegreeBucket): DegreeBucketFilterCriteria | null {
    const record = degreeState.record;
    const classYear = record?.startYear != null ? record.startYear + 4 : null;
    const depts = inferBucketDepartments(bucket, appState.loadedDepartments);
    const sheet =
      record && bucket.source === 'import'
        ? getDegreeBucketCriteria(
            record.major,
            classYear,
            bucket.category,
            bucketRuleLabel(bucket),
            depts,
          )
        : null;
    if (sheet) {
      return {
        allowedDepartments: sheet.allowedDepartments,
        excludedCourses: sheet.excludedCourses,
      };
    }

    return depts.length
      ? { allowedDepartments: depts, excludedCourses: [] }
      : null;
  }

  /** Codes already taken, in progress, or in the active schedule. */
  private coveredCodes(): string[] {
    const codes = new Set(degreeState.record?.courses.map(c => c.code) ?? []);
    for (const sc of appState.selectedCourses)
      codes.add(`${sc.course.departmentAbbr} ${sc.course.number}`);
    return [...codes];
  }

  /**
   * Apply (or, with null, clear) the degree filter for the active schedule's
   * year and go to the planner.
   */
  private browse(criteria: DegreeBucketFilterCriteria | null): void {
    if (!this.filterService) return;

    if (criteria) {
      this.filterService.addFilter('degreeBucket', criteria);
      // A BS requirement's departments include their graduate courses, which
      // swamp the list; the visible level toggle lets the user flip it back.
      this.filterService.addFilter('graduateLevel', { level: 'undergraduate' });
    } else {
      this.filterService.removeFilter('degreeBucket');
    }
    // The degree filter says which departments; a leftover department filter
    // would narrow it further, or to nothing.
    this.filterService.removeFilter('department');

    // A search left behind by openCourse would narrow the bucket's courses down
    // to that one code, or to nothing.
    this.filterService.removeFilter('searchText');

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

  /**
   * Look a degree course up in the catalog, from the course finder.
   *
   * Where openCourse aims at one known catalog entry, this aims at the search:
   * every filter dropped and the year set to All, then one query for the code.
   * The finder's question is "what does the catalog have for this course?", and
   * a leftover department or year filter is exactly what answers it wrongly -
   * a course taken three years ago is not in the active schedule's year.
   *
   * Unlike openCourse it does not give up when the catalog has no match: the
   * empty result list is the answer, and it is a truer one than an error toast.
   */
  searchCatalog(code: string, year: number | null = null): void {
    // Codes are spaced ("CS 1004") and sometimes cross-listed ("CS 2022/ MA
    // 2201"); SearchTextFilter matches the unspaced form the catalog stores.
    const [first] = candidateCodes(code);
    const query = first
      ? `${first.dept}${first.number}`
      : code.replace(/\s+/g, '');

    if (this.filterService) {
      this.filterService.resetFilters();
      // Explicit rather than "no year filter": both show every year, but this
      // one lights the All chip up, so the page says why it is showing them.
      this.filterService.addFilter('academicYear', { year: 'all' });
      this.filterService.addFilter('searchText', { query });
    }

    // Best effort - open the detail panel on the entry the finder was pointing
    // at, so the search lands on a course rather than just a filtered list.
    const course = findCatalogCourse(code, year, appState.loadedDepartments);
    if (course) courseListState.selectedCourse = course;

    setPage('planner');
    if (course) scrollCourseIntoView(course.id);
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
