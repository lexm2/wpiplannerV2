/**
 * Shared channel for "which selected course is hovered in the schedule grid".
 *
 * The (still-vanilla) schedule grid sets `hoveredCourseId` on section-block
 * mouseenter/leave; ScheduleSidebar's SelectedCourseItem reads it to toggle the
 * `.sidebar-course-highlighted` class. Replaces the old imperative
 * `ScheduleController.sidebarCourseItems` map + classList add/remove.
 */
class ScheduleSidebarState {
    hoveredCourseId = $state.raw<string | null>(null);
}

export const scheduleSidebarState = new ScheduleSidebarState();
