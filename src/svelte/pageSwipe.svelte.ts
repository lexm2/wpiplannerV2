import { tick } from 'svelte';
import { uiState } from '../services/ui/uiState.svelte';
import { tutorialOverlayState } from './tutorial/tutorialOverlayState.svelte';
import { horizontalSwipe } from './horizontalSwipe';
import { reduceMotion } from './transitions';
import type { PageId } from '../types/uiState';

/**
 * Swiping sideways between the pages on a phone, in the bottom bar's order.
 *
 * It behaves like a pager: the page follows the finger and the neighbour it
 * is heading for comes in beside it, then on release both settle - onto the
 * neighbour past a third of the screen or on a flick, back otherwise. The
 * neighbour is a real page, kept mounted behind display:none, so for the drag
 * it is shown pinned beside the current one and handed back to App's own
 * display rule once the switch lands. Swiping past the first or last page
 * only gives a little, with nothing behind it.
 *
 * `pageDrag.offset` is how far the pages have moved, in screen widths
 * (negative toward the next page), so the tab bar's marker can travel with
 * the drag instead of jumping when it ends.
 */
export const PAGE_ORDER: readonly PageId[] = ['planner', 'schedule', 'degree'];

class PageDrag {
  offset = $state(0);
  /** True while a finger is moving the pages, so the marker follows it 1:1. */
  dragging = $state(false);
}

export const pageDrag = new PageDrag();

const PAGE_EL: Record<PageId, string> = {
  planner: '#planner-page',
  schedule: '#schedule-page',
  degree: '#degree-page',
};
// Each page's display while it is the current one - mirrors App.svelte.
const PAGE_DISPLAY: Record<PageId, string> = {
  planner: 'grid',
  schedule: 'flex',
  degree: 'flex',
};

const PHONE = '(max-width: 560px)';
const SWITCH_AT = 1 / 3; // share of the screen width that commits a switch
const FLICK = 0.4; // px/ms
const EDGE_GIVE = 0.25; // how far the first and last pages stretch, per px
const SETTLE_MS = 250;
const EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';
// Touches this close to a screen edge belong to the browser's own back and
// forward swipes.
const EDGE_PX = 16;

const pageEl = (page: PageId): HTMLElement | null =>
  document.querySelector<HTMLElement>(PAGE_EL[page]);

/** Something in the touched element's ancestry can scroll sideways itself. */
function inHorizontalScroller(el: Element | null): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth) {
      const overflow = getComputedStyle(n).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
  }
  return false;
}

function canStart(e: TouchEvent): boolean {
  if (!matchMedia(PHONE).matches) return false;
  // A drawer is an entry in openModals too, so this also covers drawers.
  if (uiState.openModals.length > 0 || tutorialOverlayState.step) return false;
  const x = e.touches[0].clientX;
  if (x < EDGE_PX || x > window.innerWidth - EDGE_PX) return false;
  const target = e.target as Element | null;
  if (target?.closest('input, textarea, select, [contenteditable="true"]'))
    return false;
  return !inHorizontalScroller(target);
}

/** Pin `el` beside the current page, `x` px from where it will settle. */
function pinNeighbour(el: HTMLElement, page: PageId, x: number): void {
  el.style.display = PAGE_DISPLAY[page];
  el.style.position = 'fixed';
  el.style.top = '0';
  el.style.left = '0';
  el.style.right = '0';
  el.style.bottom = 'var(--tab-bar-height)';
  el.style.transform = `translateX(${x}px)`;
}

function unpin(el: HTMLElement, keepDisplay: boolean): void {
  if (!keepDisplay) el.style.display = 'none';
  for (const prop of ['position', 'top', 'left', 'right', 'bottom'] as const)
    el.style[prop] = '';
  el.style.transform = '';
}

/**
 * Listen for page swipes until the returned cleanup runs. `current` reads the
 * page on screen; `switchTo` runs the same switch as tapping its tab.
 */
export function installPageSwipe(
  current: () => PageId,
  switchTo: (page: PageId) => void,
): () => void {
  let neighbour: PageId | null = null;
  let settling = false;

  function neighbourFor(dx: number): PageId | null {
    const i = PAGE_ORDER.indexOf(current()) + (dx < 0 ? 1 : -1);
    return PAGE_ORDER[i] ?? null;
  }

  function onMove(rawDx: number): void {
    if (settling) return;
    const page = current();
    const own = pageEl(page);
    if (!own) return;
    const width = window.innerWidth;
    const next = neighbourFor(rawDx);
    // Reversing past the start swaps which neighbour is beside the page.
    if (neighbour && neighbour !== next) {
      const old = pageEl(neighbour);
      if (old) unpin(old, false);
    }
    neighbour = next;
    const dx = next ? rawDx : rawDx * EDGE_GIVE;
    own.style.transform = `translateX(${dx}px)`;
    if (next) {
      const el = pageEl(next);
      if (el) pinNeighbour(el, next, dx + (dx < 0 ? width : -width));
    }
    pageDrag.dragging = true;
    pageDrag.offset = next ? dx / width : 0;
  }

  function onEnd(rawDx: number, vx: number): void {
    if (settling) return;
    const page = current();
    const own = pageEl(page);
    const next = neighbour;
    const nextEl = next ? pageEl(next) : null;
    neighbour = null;
    pageDrag.dragging = false;
    if (!own) return;

    const width = window.innerWidth;
    const dx = next ? rawDx : rawDx * EDGE_GIVE;
    const flicked = Math.sign(vx) === Math.sign(dx) && Math.abs(vx) > FLICK;
    const commit =
      !!next && !!nextEl && (Math.abs(dx) > width * SWITCH_AT || flicked);
    const dir = dx < 0 ? -1 : 1;
    const ownTo = commit ? dir * width : 0;
    const nextFrom = dx - dir * width;
    const nextTo = commit ? 0 : -dir * width;

    // The marker settles alongside the pages, by its own CSS transition.
    pageDrag.offset = commit ? dir : 0;

    const ms = reduceMotion ? 0 : SETTLE_MS;
    const opts = { duration: ms, easing: EASE, fill: 'forwards' as const };
    const anims = [
      own.animate(
        [
          { transform: `translateX(${dx}px)` },
          { transform: `translateX(${ownTo}px)` },
        ],
        opts,
      ),
    ];
    if (nextEl)
      anims.push(
        nextEl.animate(
          [
            { transform: `translateX(${nextFrom}px)` },
            { transform: `translateX(${nextTo}px)` },
          ],
          opts,
        ),
      );
    settling = true;
    const done = async (): Promise<void> => {
      if (commit && next) {
        // The marker is at the new tab already; drop the offset with the
        // switch so it stays put rather than sliding again.
        pageDrag.dragging = true;
        pageDrag.offset = 0;
        switchTo(next);
        await tick();
      }
      own.style.transform = '';
      if (nextEl) unpin(nextEl, commit);
      for (const a of anims) a.cancel();
      pageDrag.dragging = false;
      settling = false;
    };
    void Promise.all(anims.map(a => a.finished)).then(done, done);
  }

  return horizontalSwipe(document, { canStart, onMove, onEnd });
}
