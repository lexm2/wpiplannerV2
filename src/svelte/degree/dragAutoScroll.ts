/**
 * Edge auto-scroll while dragging a course: holding it near the top or bottom
 * of the pane under the pointer scrolls that pane, so off-screen buckets are
 * reachable. The rAF loop drives scrolling, not an animation (see CLAUDE.md).
 */
const EDGE = 90; // px from an edge where scrolling kicks in
const MAX_SPEED = 22; // px per frame at the very edge

let raf = 0;
let pointerX = 0;
let pointerY = 0;
let active = false;

/** The pane under the pointer - a drag crosses between the two scrollers. */
function scroller(): HTMLElement | null {
  const el = document.elementFromPoint(pointerX, pointerY);
  return el instanceof Element ? el.closest<HTMLElement>('.degree-pane') : null;
}

function loop(): void {
  if (!active) return;
  const el = scroller();
  if (el) {
    const rect = el.getBoundingClientRect();
    const fromTop = pointerY - rect.top;
    const fromBottom = rect.bottom - pointerY;
    if (fromTop < EDGE) {
      el.scrollTop -=
        MAX_SPEED * Math.max(0, Math.min(1, (EDGE - fromTop) / EDGE));
    } else if (fromBottom < EDGE) {
      el.scrollTop +=
        MAX_SPEED * Math.max(0, Math.min(1, (EDGE - fromBottom) / EDGE));
    }
  }
  raf = requestAnimationFrame(loop);
}

/** Feed the loop the live pointer position. */
export function updateDragPointer(x: number, y: number): void {
  pointerX = x;
  pointerY = y;
}

export function startDragAutoScroll(x: number, y: number): void {
  updateDragPointer(x, y);
  if (active) return;
  active = true;
  raf = requestAnimationFrame(loop);
}

export function stopDragAutoScroll(): void {
  if (!active) return;
  active = false;
  cancelAnimationFrame(raf);
}
