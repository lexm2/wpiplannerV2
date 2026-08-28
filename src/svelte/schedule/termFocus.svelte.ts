import { tick } from 'svelte';
import { uiState } from '../../services/ui/uiState.svelte';
import { DeviceDetection } from '../../utils/deviceDetection';
import { reduceMotion } from '../transitions';

/**
 * Schedule-page term focus: zooming one term card up to fill the pane, and
 * paging between terms once it is.
 *
 * The zoom is a FLIP - the card's cell box has to be measured BEFORE the rune
 * flips, because an action's update() only runs after the swap - so it can't be
 * a declarative Svelte transition and runs on WAAPI instead. `capture()` plays
 * the same role `lockForFlip` does in termExpansion.svelte.ts.
 *
 * CSS owns both settled states (a card in its grid cell, or absolutely filling
 * the pane); every animation here starts from the captured pre-swap box and
 * lands exactly on the settled one, so nothing needs a lingering `fill` and
 * nothing has to be committed afterwards.
 *
 * ScheduleGrids is the only consumer, so a module-level singleton is fine.
 */

export const TERMS = ['A', 'B', 'C', 'D'];

// A phone has no room for four grids at once, so it is permanently focused and
// can never zoom out - paging between terms is the only navigation there. This
// replaces the old scroll-snap column.
export const focusLocked = DeviceDetection.isMobilePhone();

class TermFocus {
  term = $state.raw<string | null>(focusLocked ? TERMS[0] : null);
}

export const termFocus = new TermFocus();

const MORPH_MS = 280; // zoom in / out
const SLIDE_MS = 250; // term -> term page
const EASE = 'cubic-bezier(0.33, 1, 0.68, 1)'; // cubicOut
const WHEEL_NOTCH = 40; // accumulated wheel delta that counts as one page
const SWIPE_PX = 48; // touch travel that counts as one page

// Above its siblings, below .schedule-generating-overlay (z-index 10), which
// shares this stacking context and has to stay on top.
const LIFT_Z = '5';
const SLIDE_OUT_Z = '4';

type Box = { top: number; left: number; width: number; height: number };

// Set by the action. Every mutator needs it to find cards and to measure.
let gridEl: HTMLElement | null = null;

// The zooming card's box, captured before the rune flips; its counterpart is
// measured after the swap, once CSS has put the card in its new place.
let pendingBox: Box | null = null;
// Direction of the page being set up, for the slide's sign.
let pendingDir = 0;
// Set the moment a mutator commits, cleared when its animations finish. Clicks
// and gestures no-op while it holds, so two morphs can never interleave.
let busy = false;

function cardOf(term: string): HTMLElement | null {
  return (
    gridEl?.querySelector<HTMLElement>(`.term-graph[data-term="${term}"]`) ??
    null
  );
}

function otherCards(term: string): HTMLElement[] {
  return TERMS.filter(t => t !== term)
    .map(cardOf)
    .filter((el): el is HTMLElement => el !== null);
}

/** A card's box relative to the grid box - the frame `pinAt` positions against. */
function boxOf(el: HTMLElement): Box {
  const g = gridEl!.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return {
    top: r.top - g.top,
    left: r.left - g.left,
    width: r.width,
    height: r.height,
  };
}

function frame(b: Box): Keyframe {
  return {
    top: `${b.top}px`,
    left: `${b.left}px`,
    width: `${b.width}px`,
    height: `${b.height}px`,
  };
}

/** Lift a card out of grid flow and pin it at `b`, so a box tween has somewhere to start. */
function pinAt(el: HTMLElement, b: Box, z: string): void {
  el.style.position = 'absolute';
  // An absolutely-positioned grid child resolves against its grid area, so
  // without this the offsets would be read inside the card's own cell.
  el.style.gridArea = '1 / 1 / -1 / -1';
  el.style.zIndex = z;
  el.style.top = `${b.top}px`;
  el.style.left = `${b.left}px`;
  el.style.width = `${b.width}px`;
  el.style.height = `${b.height}px`;
}

function unpin(el: HTMLElement): void {
  el.style.position = '';
  el.style.gridArea = '';
  el.style.zIndex = '';
  el.style.top = '';
  el.style.left = '';
  el.style.width = '';
  el.style.height = '';
}

function capture(term: string): void {
  const el = cardOf(term);
  pendingBox = el ? boxOf(el) : null;
}

function settle(anims: Animation[], done: () => void): void {
  const finish = (): void => {
    done();
    busy = false;
  };
  void Promise.all(anims.map(a => a.finished)).then(finish, finish);
}

export function toggleFocus(term: string): void {
  if (busy || !gridEl) return;
  if (termFocus.term === null) {
    capture(term);
    busy = true;
    termFocus.term = term;
    return;
  }
  // Only the focused card is clickable (the rest are pointer-events: none), so
  // any click that lands while focused is a request to zoom back out.
  if (termFocus.term === term) unfocus();
}

export function unfocus(): void {
  if (busy || focusLocked || termFocus.term === null || !gridEl) return;
  capture(termFocus.term);
  busy = true;
  termFocus.term = null;
}

export function stepTerm(dir: 1 | -1): void {
  if (busy || termFocus.term === null || !gridEl) return;
  const i = TERMS.indexOf(termFocus.term);
  pendingDir = dir;
  busy = true;
  termFocus.term = TERMS[(i + dir + TERMS.length) % TERMS.length];
}

/**
 * Zoom `term`'s card between its grid cell and the full pane. `from` is the
 * pre-swap box; the post-swap box is measured here, because by now CSS has
 * moved the card to wherever it is settling.
 *
 * The box is animated rather than a transform: the cell and the pane have
 * different aspect ratios, so a scale would need separate x/y factors and would
 * squash the day headers and gridlines mid-flight. Tweening top/left/width/
 * height lets the grid reflow honestly on every frame instead.
 */
function runZoom(term: string, from: Box | null, into: boolean): void {
  const el = cardOf(term);
  if (!el) {
    busy = false;
    return;
  }
  const to = boxOf(el);
  const start = from ?? to;

  // Zooming in, CSS already holds the card absolute and filling the pane.
  // Zooming out it is back in grid flow, so it has to be lifted again for the
  // tween - inline styles outrank the class that was just dropped, and the
  // animation lands exactly on the cell box, so unpinning at the end is silent.
  if (!into) pinAt(el, start, LIFT_Z);

  const ms = reduceMotion ? 0 : MORPH_MS;
  const anims = [
    el.animate([frame(start), frame(to)], { duration: ms, easing: EASE }),
    // The other three fade with it and land on whatever CSS holds for them -
    // 0 while a term is focused, 1 otherwise.
    ...otherCards(term).map(s =>
      s.animate(
        into
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [{ opacity: 0 }, { opacity: 1 }],
        { duration: ms, easing: EASE },
      ),
    ),
  ];

  settle(anims, () => {
    if (!into) unpin(el);
  });
}

/**
 * Page from one focused term to the next. Both cards have to be full-size in
 * the same place to pass each other, so the outgoing one is pinned over the
 * incoming one's box (which CSS has already sized) and they translate past.
 * .terms-grid clips, so nothing escapes the pane.
 */
function runSlide(from: string, to: string, dir: number): void {
  const outEl = cardOf(from);
  const inEl = cardOf(to);
  if (!outEl || !inEl) {
    busy = false;
    return;
  }

  const box = boxOf(inEl);
  pinAt(outEl, box, SLIDE_OUT_Z);

  // Paging forward brings the next term up from below.
  const shift = dir > 0 ? 100 : -100;
  const ms = reduceMotion ? 0 : SLIDE_MS;
  const anims = [
    // The outgoing card lost .focused-term, so CSS is already holding it at
    // opacity 0; pin it opaque for the duration or it would vanish instead of
    // sliding, then let CSS take back over.
    outEl.animate(
      [
        { transform: 'translateY(0)', opacity: 1 },
        { transform: `translateY(${-shift}%)`, opacity: 1 },
      ],
      { duration: ms, easing: EASE },
    ),
    inEl.animate(
      [{ transform: `translateY(${shift}%)` }, { transform: 'translateY(0)' }],
      { duration: ms, easing: EASE },
    ),
  ];

  settle(anims, () => unpin(outEl));
}

/**
 * Applied to .terms-grid with `termFocus.term` as its parameter: runs the
 * motion when that changes, and owns every input that drives it.
 */
export function termMotion(node: HTMLElement, term: string | null) {
  gridEl = node;
  let current = term;
  let accum = 0;
  let touchStartY = 0;
  let swiping = false;

  function onWheel(e: WheelEvent): void {
    if (termFocus.term === null) return;
    e.preventDefault();
    // Trackpad momentum keeps firing after a flick; dropping what arrives mid
    // animation is what keeps one gesture to one page.
    if (busy) {
      accum = 0;
      return;
    }
    const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (d === 0) return;
    if (Math.sign(d) !== Math.sign(accum)) accum = 0;
    accum += d;
    if (Math.abs(accum) < WHEEL_NOTCH) return;
    const dir = accum > 0 ? 1 : -1;
    accum = 0;
    stepTerm(dir);
  }

  function onTouchStart(e: TouchEvent): void {
    swiping = termFocus.term !== null && !busy && e.touches.length === 1;
    if (swiping) touchStartY = e.touches[0].clientY;
  }

  function onTouchMove(e: TouchEvent): void {
    if (!swiping) return;
    const dy = touchStartY - e.touches[0].clientY;
    if (Math.abs(dy) < SWIPE_PX) return;
    swiping = false;
    // Swiping up pulls the next term into view, matching the wheel.
    stepTerm(dy > 0 ? 1 : -1);
  }

  function endTouch(): void {
    swiping = false;
  }

  function onKeydown(e: KeyboardEvent): void {
    // The schedule page stays mounted behind display:none when another tab is
    // showing, so offsetParent is what tells us these keys are ours to take.
    // A modal over the top has first claim on them either way - Escape belongs
    // to it, and paging terms underneath one is not what the reader asked for.
    if (
      termFocus.term === null ||
      node.offsetParent === null ||
      uiState.openModals.length > 0
    )
      return;
    if (e.key === 'Escape') {
      e.preventDefault();
      unfocus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      stepTerm(1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      stepTerm(-1);
    }
  }

  node.addEventListener('wheel', onWheel, { passive: false });
  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchmove', onTouchMove, { passive: true });
  node.addEventListener('touchend', endTouch);
  node.addEventListener('touchcancel', endTouch);
  window.addEventListener('keydown', onKeydown);

  return {
    update(next: string | null): void {
      if (next === current) return;
      const prev = current;
      current = next;
      const from = pendingBox;
      const dir = pendingDir;
      pendingBox = null;
      pendingDir = 0;
      // Wait for the class swap to land, then animate to where CSS put things.
      void tick().then(() => {
        if (prev !== null && next !== null) runSlide(prev, next, dir);
        else if (next !== null) runZoom(next, from, true);
        else if (prev !== null) runZoom(prev, from, false);
        else busy = false;
      });
    },
    destroy(): void {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', endTouch);
      node.removeEventListener('touchcancel', endTouch);
      window.removeEventListener('keydown', onKeydown);
      if (gridEl === node) gridEl = null;
    },
  };
}
