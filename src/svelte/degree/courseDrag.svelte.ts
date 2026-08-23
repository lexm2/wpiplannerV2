import { degreeBucketService } from '../../services/degree/degreeBucketService';
import {
  startDragAutoScroll,
  stopDragAutoScroll,
  updateDragPointer,
} from './dragAutoScroll';
import { dur } from '../transitions';

/**
 * Pointer dragging for course tiles.
 *
 * The tile itself moves: on lift it goes `position: fixed` at its own viewport
 * rect, with a placeholder holding its slot. Fixed positioning is what lets it
 * travel between the bucket pane and the rail, separate scrollers that would
 * otherwise clip it.
 *
 * Mouse and pen only - on touch a press stays available for scrolling, so the
 * Assign menu is the placement path there.
 */

/** Drop target for the unassigned rail; anything else is a bucket id. */
export const RAIL_TARGET = 'rail';

class CourseDragState {
  /** Course being dragged, or null when idle. */
  courseId = $state.raw<string | null>(null);
  /** Drop target under the pointer, for highlighting it. */
  target = $state.raw<string | null>(null);
}

export const courseDrag = new CourseDragState();

export interface CourseDragParams {
  /** null for a fixed tile (Workday's own placements), which never drags. */
  courseId: string | null;
  /** Bucket it sits in now; null while it is in the rail. */
  from: string | null;
}

const THRESHOLD = 4; // px of movement before a press becomes a drag

export function draggableCourse(node: HTMLElement, params: CourseDragParams) {
  let current = params;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;
  let placeholder: HTMLElement | null = null;
  let dragging = false;
  let armed = false;
  let capturedId: number | null = null;

  function onPointerDown(e: PointerEvent): void {
    if (!current.courseId) return;
    if (e.button !== 0 || e.pointerType === 'touch') return;
    // Let the tile's own controls take the press.
    if ((e.target as Element).closest('button, a, input, select, textarea'))
      return;
    armed = true;
    startX = e.clientX;
    startY = e.clientY;
    capturedId = e.pointerId;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function begin(e: PointerEvent): void {
    // Capture on the root, not the tile - the tile goes pointer-events:none so
    // it can be dragged over its own drop targets. Keeps the release reaching
    // us when it happens outside the window.
    try {
      document.documentElement.setPointerCapture(e.pointerId);
    } catch {
      /* the window listeners still cover the normal case */
    }

    const rect = node.getBoundingClientRect();
    offsetX = startX - rect.left;
    offsetY = startY - rect.top;

    // Hold the slot so the layout doesn't collapse behind the tile.
    placeholder = document.createElement('div');
    placeholder.className = 'course-drag-placeholder';
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.height = `${rect.height}px`;
    node.parentElement?.insertBefore(placeholder, node);

    node.classList.add('is-dragging');
    node.style.position = 'fixed';
    node.style.zIndex = '1000';
    node.style.width = `${rect.width}px`;
    node.style.height = `${rect.height}px`;
    node.style.pointerEvents = 'none';
    node.style.margin = '0';
    moveTo(e.clientX, e.clientY);

    dragging = true;
    courseDrag.courseId = current.courseId;

    startDragAutoScroll(e.clientX, e.clientY);
  }

  function moveTo(x: number, y: number): void {
    node.style.left = `${x - offsetX}px`;
    node.style.top = `${y - offsetY}px`;
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragging) {
      if (!armed) return;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < THRESHOLD)
        return;
      begin(e);
    }
    e.preventDefault();
    moveTo(e.clientX, e.clientY);
    updateDragPointer(e.clientX, e.clientY);
    courseDrag.target = targetAt(e.clientX, e.clientY);
  }

  function onPointerUp(e: PointerEvent): void {
    releaseCapture();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    armed = false;
    if (!dragging) return;

    stopDragAutoScroll();
    const target = targetAt(e.clientX, e.clientY);
    courseDrag.courseId = null;
    courseDrag.target = null;

    const courseId = current.courseId;
    if (
      courseId &&
      target &&
      target !== RAIL_TARGET &&
      target !== current.from
    ) {
      degreeBucketService.assign(courseId, target);
      finish(); // the tile re-renders into its new bucket
    } else if (courseId && target === RAIL_TARGET && current.from) {
      degreeBucketService.unassign(courseId);
      finish();
    } else {
      returnHome();
    }
  }

  /** Ease the tile back to its slot, then drop the drag styles. */
  function returnHome(): void {
    const home = placeholder?.getBoundingClientRect();
    const duration = dur(180);
    if (!home || duration === 0) {
      finish();
      return;
    }
    const from = node.getBoundingClientRect();
    const anim = node.animate(
      [
        { transform: 'translate(0, 0)' },
        {
          transform: `translate(${home.left - from.left}px, ${home.top - from.top}px)`,
        },
      ],
      { duration, easing: 'ease-out' },
    );
    anim.finished.then(finish).catch(finish);
  }

  function finish(): void {
    dragging = false;
    node.classList.remove('is-dragging');
    node.getAnimations().forEach(a => a.cancel());
    for (const prop of [
      'position',
      'left',
      'top',
      'width',
      'height',
      'zIndex',
      'pointerEvents',
      'margin',
    ]) {
      node.style.removeProperty(
        prop.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`),
      );
    }
    placeholder?.remove();
    placeholder = null;
  }

  function releaseCapture(): void {
    if (capturedId === null) return;
    try {
      document.documentElement.releasePointerCapture(capturedId);
    } catch {
      /* already released */
    }
    capturedId = null;
  }

  node.addEventListener('pointerdown', onPointerDown);

  return {
    update(next: CourseDragParams) {
      current = next;
    },
    destroy() {
      releaseCapture();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      stopDragAutoScroll();
      finish();
      node.removeEventListener('pointerdown', onPointerDown);
    },
  };
}

/** The bucket or rail under a point; the dragged tile is pointer-events:none. */
function targetAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  if (!(el instanceof Element)) return null;
  const card = el.closest<HTMLElement>('[data-bucket-id]');
  if (card) return card.dataset.bucketId ?? null;
  return el.closest('.degree-rail') ? RAIL_TARGET : null;
}
