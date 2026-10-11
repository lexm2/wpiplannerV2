import { MediaQuery } from 'svelte/reactivity';

/**
 * The phone layout, for markup that differs there and not just its styling.
 * The same 560px as every phone rule in the CSS, so the two never disagree.
 */
export const phoneLayout = new MediaQuery('(max-width: 560px)');

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
