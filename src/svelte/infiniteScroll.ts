import { tick } from 'svelte';
import { scrollParent } from '../utils/scrollParent';

// Fire this far ahead of the bottom, so the next page is laid out before the
// reader reaches it.
const PRELOAD_PX = 600;

/**
 * Call `onReach` when this element comes within `PRELOAD_PX` of the bottom of
 * whatever scrolls it.
 *
 * Mounting and unmounting the node is the whole arm/disarm story: `destroy`
 * disconnects.
 */
export function infiniteScroll(node: HTMLElement, onReach: () => void) {
  let current = onReach;
  let destroyed = false;

  // The scroller is an ancestor, not the window. Against the viewport root the
  // sentinel stays clipped by it and rootMargin buys nothing.
  const parent = scrollParent(node);
  const root = parent === document.documentElement ? null : parent;

  const observer = new IntersectionObserver(
    entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      current();
      // An observer reports only changes, and a new page often leaves the
      // sentinel inside the band. Re-observing replays an initial observation
      // against the new layout, so the list fills until the sentinel clears.
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
