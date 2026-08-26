import { reduceMotion } from './transitions';
import { wizardState } from './wizardState.svelte';

/**
 * Shared channel for "which selected course is hovered in the schedule grid".
 *
 * The Svelte schedule grid (TermGrid) sets `hoveredCourseId` on section-block
 * mouseenter/leave; ScheduleSidebar's SelectedCourseItem reads it to toggle the
 * `.sidebar-course-highlighted` class. Replaces the old imperative
 * `ScheduleController.sidebarCourseItems` map + classList add/remove.
 */
class ScheduleSidebarState {
  hoveredCourseId = $state.raw<string | null>(null);
}

export const scheduleSidebarState = new ScheduleSidebarState();

/**
 * Scroll a highlighted sidebar item into view, called by the item itself.
 *
 * A highlight the reader cannot see says nothing, and the sidebar holds every
 * selected course while the grid shows one term at a time - so the course under
 * the pointer is routinely scrolled out of the list.
 *
 * `block: 'nearest'` is what keeps this quiet: an item already on screen is left
 * exactly where it is, so running the pointer along a row of blocks moves the
 * list only when the hover actually names something off screen.
 */
export function revealSidebarCourse(el: HTMLElement): void {
  // The wizard panel is absolutely positioned at the top of this scroller and
  // pins it there (see wizardScrollLock); scrolling out from under it would
  // take the wizard off screen with no way back.
  if (wizardState.isOpen) return;
  el.scrollIntoView({
    block: 'nearest',
    behavior: reduceMotion ? 'auto' : 'smooth',
  });
}
