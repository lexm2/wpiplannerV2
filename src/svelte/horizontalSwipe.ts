/**
 * A one-finger horizontal drag, told apart from a vertical scroll.
 *
 * The first few pixels of travel decide the axis: mostly sideways and the
 * gesture is ours from then on (its moves are reported, and the browser is
 * kept from acting on them); mostly up or down and it is left alone for the
 * rest of the touch, so lists still scroll. Shared by the drawers' swipe to
 * close and the phone page swipe.
 *
 * The surface should also carry `touch-action: pan-y pinch-zoom`, so the
 * browser hands horizontal travel to the page instead of claiming it.
 */
export interface SwipeHandlers {
  /** Return false to leave a touch that starts here alone. */
  canStart?: (event: TouchEvent) => boolean;
  /** The finger has moved `dx` px sideways from where it went down. */
  onMove: (dx: number) => void;
  /**
   * The drag is over: `dx` is the final travel and `vx` the speed at release
   * in px/ms (signed like dx). A cancelled touch ends with both 0.
   */
  onEnd: (dx: number, vx: number) => void;
}

// Travel before the axis is decided - small enough to feel immediate, large
// enough that a slightly diagonal tap or scroll is not mistaken for a drag.
const LOCK_PX = 10;

export function horizontalSwipe(
  target: HTMLElement | Document,
  handlers: SwipeHandlers,
): () => void {
  let phase: 'idle' | 'deciding' | 'dragging' = 'idle';
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let lastX = 0;
  let lastT = 0;
  let vx = 0;

  function onStart(e: Event): void {
    const event = e as TouchEvent;
    if (event.touches.length !== 1 || handlers.canStart?.(event) === false) {
      phase = 'idle';
      return;
    }
    const t = event.touches[0];
    phase = 'deciding';
    startX = lastX = t.clientX;
    startY = t.clientY;
    lastT = event.timeStamp;
    dx = vx = 0;
  }

  function onMove(e: Event): void {
    const event = e as TouchEvent;
    if (phase === 'idle') return;
    if (event.touches.length !== 1) {
      finish(true);
      return;
    }
    const t = event.touches[0];
    const moveX = t.clientX - startX;
    const moveY = t.clientY - startY;
    if (phase === 'deciding') {
      if (Math.abs(moveX) < LOCK_PX && Math.abs(moveY) < LOCK_PX) return;
      if (Math.abs(moveX) <= Math.abs(moveY)) {
        phase = 'idle';
        return;
      }
      phase = 'dragging';
    }
    if (event.cancelable) event.preventDefault();
    // Speed over the last move only, lightly smoothed, so a flick that
    // slows just before release still reads as a flick.
    const dt = event.timeStamp - lastT;
    if (dt > 0) vx = 0.6 * ((t.clientX - lastX) / dt) + 0.4 * vx;
    lastX = t.clientX;
    lastT = event.timeStamp;
    dx = moveX;
    handlers.onMove(dx);
  }

  function finish(cancelled: boolean): void {
    if (phase === 'dragging') {
      if (cancelled) handlers.onEnd(0, 0);
      else handlers.onEnd(dx, vx);
    }
    phase = 'idle';
  }

  const onEnd = (): void => finish(false);
  const onCancel = (): void => finish(true);

  target.addEventListener('touchstart', onStart, { passive: true });
  // Not passive: a horizontal drag has to stop the browser acting on it.
  target.addEventListener('touchmove', onMove, { passive: false });
  target.addEventListener('touchend', onEnd);
  target.addEventListener('touchcancel', onCancel);
  return () => {
    target.removeEventListener('touchstart', onStart);
    target.removeEventListener('touchmove', onMove);
    target.removeEventListener('touchend', onEnd);
    target.removeEventListener('touchcancel', onCancel);
  };
}
