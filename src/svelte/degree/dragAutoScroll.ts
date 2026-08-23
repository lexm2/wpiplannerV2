/**
 * Edge auto-scroll for HTML5 drag on the Degree page: while a tile is being
 * dragged, hovering near the top/bottom of the scroll container scrolls it so
 * you can drop onto requirements that are off-screen. Native DnD doesn't scroll
 * the page on its own, hence this helper.
 *
 * Call startDragAutoScroll() from a tile's dragstart; it self-terminates on the
 * document `dragend`/`drop`.
 */
const EDGE = 90; // px from an edge where scrolling kicks in
const MAX_SPEED = 22; // px per frame at the very edge

let raf = 0;
let pointerY = 0;
let active = false;

function scroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.degree-page');
}

function onDragOver(e: DragEvent): void {
  pointerY = e.clientY;
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

export function startDragAutoScroll(): void {
  if (active) return;
  active = true;
  document.addEventListener('dragover', onDragOver);
  document.addEventListener('dragend', stopDragAutoScroll);
  document.addEventListener('drop', stopDragAutoScroll);
  raf = requestAnimationFrame(loop);
}

export function stopDragAutoScroll(): void {
  if (!active) return;
  active = false;
  cancelAnimationFrame(raf);
  document.removeEventListener('dragover', onDragOver);
  document.removeEventListener('dragend', stopDragAutoScroll);
  document.removeEventListener('drop', stopDragAutoScroll);
}
