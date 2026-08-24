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
 * The placeholder only holds that slot while the pointer is still over the list
 * the tile came from; once it heads elsewhere the slot closes and the list flows
 * back together, reopening if the tile comes back. The destination list opens a
 * slot of its own to receive it - see UnassignedRail.
 *
 * Mouse and pen only - on touch a press stays available for scrolling, so the
 * Assign menu is the placement path there.
 */

/** Drop target for the unassigned rail; anything else is a bucket id. */
export const RAIL_TARGET = 'rail';

/** How long a slot takes to close behind the tile, or open ahead of it. */
export const SLOT_MS = 160;

class CourseDragState {
  /** Course being dragged, or null when idle. */
  courseId = $state.raw<string | null>(null);
  /** Drop target under the pointer, for highlighting it. */
  target = $state.raw<string | null>(null);
  /** Height of the lifted tile, so a list can size the slot it opens for it. */
  height = $state.raw(0);
  /**
   * Raised when a drop commits, so a list holding a slot open for the incoming
   * tile drops that slot instantly rather than collapsing it under the real
   * tile arriving in its place. Lowered again when the next drag begins - a
   * timer would race Svelte's own scheduling of the outro.
   */
  settling = $state.raw(false);
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
  /** Only a single-column flex list can close a slot by collapsing it. */
  let slotCollapsible = false;
  let slotHeight = 0;
  let slotGap = 0;
  let slotOpen = true;
  let slotAnim: Animation | null = null;

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

    // Hold the slot so the layout doesn't collapse behind the tile. It only
    // stays held while the pointer is still over the list it came from -
    // setSlotOpen closes it once the tile is on its way somewhere else.
    const list = node.parentElement;
    const listStyle = list ? getComputedStyle(list) : null;
    slotCollapsible =
      listStyle?.display === 'flex' && listStyle.flexDirection === 'column';
    slotGap = listStyle ? parseFloat(listStyle.rowGap) || 0 : 0;
    slotHeight = rect.height;
    slotOpen = true;

    placeholder = document.createElement('div');
    placeholder.className = 'course-drag-placeholder';
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.height = `${rect.height}px`;
    list?.insertBefore(placeholder, node);

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
    courseDrag.height = rect.height;
    courseDrag.settling = false;

    startDragAutoScroll(e.clientX, e.clientY);
  }

  function moveTo(x: number, y: number): void {
    node.style.left = `${x - offsetX}px`;
    node.style.top = `${y - offsetY}px`;
  }

  /** The list's own name for the slot the tile is sitting in right now. */
  function originTarget(): string {
    return current.from ?? RAIL_TARGET;
  }

  /**
   * Close the slot the tile was lifted out of, so the rest of the list flows
   * back together behind it - and reopen it the moment the tile comes back over
   * its own list, so releasing there drops it into a gap that is already
   * waiting. Grid lists keep a fixed slot instead: a zero-height cell still
   * holds its column, so collapsing one there closes nothing.
   *
   * The negative bottom margin swallows the list's row gap, which a zero-height
   * child would otherwise leave behind as a stray sliver.
   */
  function setSlotOpen(open: boolean): void {
    if (!placeholder || !slotCollapsible || slotOpen === open) return;
    slotOpen = open;
    const el = placeholder;
    const from = slotFrame(el);
    slotAnim?.cancel();
    // Write the end state first and animate up to it, so nothing has to linger
    // with fill:forwards to hold the slot where it landed.
    el.style.height = open ? `${slotHeight}px` : '0px';
    el.style.marginBottom = open ? '' : `${-slotGap}px`;
    el.style.borderWidth = open ? '' : '0';
    el.style.opacity = open ? '' : '0';
    const duration = dur(SLOT_MS);
    if (duration === 0) return;
    slotAnim = el.animate([from, slotFrame(el)], {
      duration,
      easing: 'ease-out',
    });
  }

  /** The slot's animatable box, read live so an interrupted collapse resumes. */
  function slotFrame(el: HTMLElement): Keyframe {
    const s = getComputedStyle(el);
    return {
      height: s.height,
      marginBottom: s.marginBottom,
      borderTopWidth: s.borderTopWidth,
      borderBottomWidth: s.borderBottomWidth,
      opacity: s.opacity,
    };
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
    const target = targetAt(e.clientX, e.clientY);
    courseDrag.target = target;
    setSlotOpen(target === originTarget());
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
      // The rail is already holding a slot open at this course's place in the
      // list; `settling` is what stops that slot from collapsing under it.
      courseDrag.settling = true;
      degreeBucketService.unassign(courseId);
      finish();
    } else {
      returnHome();
    }
  }

  /** Ease the tile back to its slot, then drop the drag styles. */
  function returnHome(): void {
    // Released somewhere that isn't a target: the slot reopens and the tile
    // flies back into it, so measure where it will be, not where it is.
    setSlotOpen(true);
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
    slotAnim?.cancel();
    slotAnim = null;
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
