import { tick } from 'svelte';
import { scrollParent } from '../utils/scrollParent';

/**
 * Call `onReach` when this element comes within a screenful of the bottom of
 * whatever scrolls it - the course list's "render the next page" trigger.
 *
 * An action rather than an `$effect` because the behaviour belongs to the
 * sentinel element itself, and because mounting and unmounting the sentinel is
 * then the whole of the arm/disarm story: the list drops it once there is
 * nothing left to page in, and `destroy` disconnects.
 */

// How far ahead of the true bottom to fire - roughly eight list rows, or three
// grid rows, so the next page is already laid out by the time it is scrolled to.
const PRELOAD_PX = 600;

export function infiniteScroll(node: HTMLElement, onReach: () => void) {
  let current = onReach;
  let destroyed = false;

  // The list scrolls inside an ancestor (#course-container), not the window, so
  // the observer has to take that ancestor as its root. Left on the default
  // viewport root the sentinel would still be clipped by the container and
  // rootMargin would buy nothing - the page would only load once the bottom was
  // genuinely on screen.
  const parent = scrollParent(node);
  const root = parent === document.documentElement ? null : parent;

  const observer = new IntersectionObserver(
    entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      current();
      // An observer reports changes, and appending a page often leaves the
      // sentinel still inside the band - a tall window, or the short rows below
      // 1440px where the section badges are hidden. Re-observing replays an
      // initial observation against the new layout, so the list keeps filling
      // until the sentinel clears the band or the list drops it.
      void tick().then(() => {
        if (destroyed || !node.isConnected) return;
        observer.unobserve(node);
        observer.observe(node);
      });
    },
    { root, rootMargin: `${PRELOAD_PX}px 0px` },
  );
  observer.observe(node);

  return {
    update(next: () => void): void {
      current = next;
    },
    destroy(): void {
      destroyed = true;
      observer.disconnect();
    },
  };
}
