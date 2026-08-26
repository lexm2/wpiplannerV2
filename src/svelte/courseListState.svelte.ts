/**
 * Shared state for the classes-page course list: which course is selected, and
 * how much of the filtered list is rendered.
 *
 * Selection is the bridge between the Svelte CourseList / SelectedCoursesPanel
 * and CourseDescription.svelte. CourseList and SelectedCoursesPanel set
 * `selectedCourse` (the full Course object) on item click. CourseDescription
 * reads it directly to render the description panel. The old vanilla bridge
 * (CourseController) is gone. `selectedCourseId` is kept as a getter so existing
 * id reads (e.g. CourseList's `active` highlight) keep working - reading a
 * `$state.raw` field through a getter is still reactive inside `$derived`/templates.
 *
 * Paging lives here rather than in CourseList so the tutorial can grow the
 * window to bring a step's target into the DOM.
 */
import type { Course } from '../types/types';

const PAGE_SIZE = 100;

class CourseListState {
  selectedCourse = $state.raw<Course | null>(null);
  get selectedCourseId(): string | null {
    return this.selectedCourse?.id ?? null;
  }

  /** How many of the filtered, sorted courses the list renders. */
  shownCount = $state(PAGE_SIZE);

  /** Render one more page. Unclamped - the list slices against it. */
  showMore(): void {
    this.shownCount += PAGE_SIZE;
  }

  /** Back to the first page - a new result set starts at the top. */
  resetPaging(): void {
    this.shownCount = PAGE_SIZE;
  }
}

export const courseListState = new CourseListState();
