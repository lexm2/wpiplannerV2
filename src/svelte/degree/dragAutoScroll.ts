/**
 * Edge auto-scroll while dragging a course: holding it near the top or bottom
 * of the pane under the pointer scrolls that pane, so off-screen buckets are
 * reachable. The rAF loop drives scrolling, not an animation.
 */
const EDGE = 90; // px from an edge where scrolling kicks in
const MAX_SPEED = 22; // px per frame at the very edge

let raf = 0;
let pointerX = 0;
let pointerY = 0;
let active = false;
let lastScroller: HTMLElement | null = null;
let onScroll: (() => void) | null = null;

/**
 * The pane under the pointer - a drag crosses between the two scrollers. The
 * captured pointer can leave the window, where elementFromPoint finds nothing,
 * so the hit-test point is clamped into the viewport; if even that misses a
 * pane, the last one found keeps scrolling.
 */
function scroller(): HTMLElement | null {
  const maxX = window.innerWidth - 1;
  const maxY = window.innerHeight - 1;
  const outside =
    pointerX < 0 || pointerY < 0 || pointerX > maxX || pointerY > maxY;
  const x = Math.max(0, Math.min(maxX, pointerX));
  const y = Math.max(0, Math.min(maxY, pointerY));
  const hit = document.elementFromPoint(x, y);
  const pane =
    hit instanceof Element ? hit.closest<HTMLElement>('.degree-pane') : null;
  if (pane) lastScroller = pane;
  return pane ?? (outside ? lastScroller : null);
}

function loop(): void {
  if (!active) return;
  const el = scroller();
  if (el) {
    const rect = el.getBoundingClientRect();
    const fromTop = pointerY - rect.top;
    const fromBottom = rect.bottom - pointerY;
    const before = el.scrollTop;
    if (fromTop < EDGE) {
      el.scrollTop -=
        MAX_SPEED * Math.max(0, Math.min(1, (EDGE - fromTop) / EDGE));
    } else if (fromBottom < EDGE) {
      el.scrollTop +=
        MAX_SPEED * Math.max(0, Math.min(1, (EDGE - fromBottom) / EDGE));
    }
    // The content moved under a pointer that may be standing still, so what it
    // is over has changed without a pointermove to say so.
    if (el.scrollTop !== before) onScroll?.();
  }
  raf = requestAnimationFrame(loop);
}

/** Feed the loop the live pointer position. */
export function updateDragPointer(x: number, y: number): void {
  pointerX = x;
  pointerY = y;
}

/**
 * Start the loop. `scrolled` runs after each step that actually moved a pane,
 * so the caller can re-hit-test whatever is now under the pointer.
 */
export function startDragAutoScroll(
  x: number,
  y: number,
  scrolled?: () => void,
): void {
  updateDragPointer(x, y);
  onScroll = scrolled ?? null;
  if (active) return;
  active = true;
  raf = requestAnimationFrame(loop);
}

export function stopDragAutoScroll(): void {
  if (!active) return;
  active = false;
  cancelAnimationFrame(raf);
  lastScroller = null;
  onScroll = null;
}
