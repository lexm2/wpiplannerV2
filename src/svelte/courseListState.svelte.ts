/**
 * Shared channel for "which course is selected in the list" — the bridge between
 * the Svelte CourseList and the (still-vanilla) course-description panel.
 *
 * CourseList sets `selectedCourseId` on item click. In this step the description
 * panel is still rendered by CourseController, so CourseList ALSO calls an
 * `onSelectCourse(course)` prop to drive it. In a later step the vanilla path is
 * removed and CourseDescription.svelte reads this rune directly.
 */
class CourseListState {
    selectedCourseId = $state<string | null>(null);
}

export const courseListState = new CourseListState();
