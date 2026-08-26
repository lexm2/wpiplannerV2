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
 * Paging lives here rather than inside CourseList because the tutorial has to be
 * able to bring a step's target into the DOM. It used to do that by clicking the
 * "Load more" button; the list loads on scroll now, so there is no button to
 * click and it grows the window through `showMore` instead.
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

  /**
   * Render one more page. Deliberately unclamped: the list slices against it, so
   * a count past the end of the results renders the whole list and no more, and
   * `resetPaging` pulls it back the moment the result set changes.
   */
  showMore(): void {
    this.shownCount += PAGE_SIZE;
  }

  /** Back to the first page - a new result set starts at the top. */
  resetPaging(): void {
    this.shownCount = PAGE_SIZE;
  }
}

export const courseListState = new CourseListState();
