/**
 * Shared channel for "which course is selected in the list" - the bridge between
 * the Svelte CourseList / SelectedCoursesPanel and CourseDescription.svelte.
 *
 * CourseList and SelectedCoursesPanel set `selectedCourse` (the full Course
 * object) on item click. CourseDescription.svelte reads it directly to render
 * the description panel. The old vanilla bridge (CourseController) is gone.
 * `selectedCourseId` is kept as a getter so existing id reads (e.g. CourseList's
 * `class:active` highlight) keep working - reading a `$state.raw` field through a
 * getter is still reactive inside `$derived`/templates.
 */
import type { Course } from '../types/types';

class CourseListState {
  selectedCourse = $state.raw<Course | null>(null);
  get selectedCourseId(): string | null {
    return this.selectedCourse?.id ?? null;
  }
}

export const courseListState = new CourseListState();
