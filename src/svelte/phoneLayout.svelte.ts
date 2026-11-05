import { MediaQuery } from 'svelte/reactivity';
import { DeviceDetection } from '../utils/deviceDetection';

/**
 * The phone layout, for markup that differs there and not just its styling.
 * The same 560px as every phone rule in the CSS, so the two never disagree.
 */
export const phoneLayout = new MediaQuery('(max-width: 560px)');

/**
 * Whether the interactive tutorials can run. They are built around the desktop
 * layout, so a phone gets none: the narrow layout, or a phone user agent (a
 * phone in landscape is wider than 560px). Reactive through phoneLayout.
 */
export function tutorialsAvailable(): boolean {
  return !(phoneLayout.current || DeviceDetection.isMobilePhone());
}

/**
 * A touch screen as the main pointer, at any width. Courses can't be dragged
 * by touch (courseDrag), so these place them through the Move sheet too - an
 * iPad as much as a phone. A touch laptop driven by its mouse is not one.
 */
const coarsePointer = new MediaQuery('(pointer: coarse)');

/** Whether placing a course goes through the Move sheet rather than a drag. */
export function placesBySheet(): boolean {
  return phoneLayout.current || coarsePointer.current;
}

/**
 * Below 992px the Degree page has no room for the Unassigned rail as a
 * column, and stacked above the buckets it was a cramped second scroller -
 * so from there down the page lists those courses at its top instead.
 */
export const railStacked = new MediaQuery('(max-width: 991px)');

/**
 * The header folds Schedules, theme and undo/redo into the gear menu here.
 * The same query as header.css, in em so a larger default text size collapses
 * it earlier (1250px at 16px).
 */
export const headerCollapsed = new MediaQuery('(max-width: 78.125em)');
