/**
 * DOM positioning helpers for the tutorial floating box. All operate on a passed
 * `box` element and read live layout; none touch component state.
 */

type Area = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;

// Where the box is once it has landed. Its offset box, because it arrives scaling
// in and getBoundingClientRect would report it mid-animation.
function boxArea(box: HTMLElement): Area {
  const left = box.offsetLeft;
  const top = box.offsetTop;
  return {
    left,
    top,
    right: left + box.offsetWidth,
    bottom: top + box.offsetHeight,
  };
}

/**
 * Whether the student can actually get at a step's target: not hidden on another
 * page, parked off-canvas in a closed drawer, scrolled out of its container or
 * under another window. Under the tutorial box doesn't count, since the box moves
 * itself off the target.
 */
export function targetOnScreen(selector: string): boolean {
  const el = document.querySelector(selector);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const at = document.elementFromPoint(
    r.left + r.width / 2,
    r.top + r.height / 2,
  );
  if (!at) return false;
  return (
    el.contains(at) ||
    !!at.closest('label')?.contains(el) ||
    !!at.closest('[data-tutorial-box]')
  );
}

/** Nudge the box back inside the viewport (8px inset) if it overflows any edge. */
export function clampToViewport(box: HTMLElement): void {
  const area = boxArea(box);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let { left, top } = area;

  if (area.bottom > vh) top = vh - box.offsetHeight - INSET;
  if (top < 0) top = INSET;
  if (area.right > vw) left = vw - box.offsetWidth - INSET;
  if (area.left < 0) left = INSET;

  if (left !== area.left || top !== area.top) {
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.bottom = 'auto';
  }
}

// The window each box was last placed against. See `placeBox`.
const placedIn = new WeakMap<HTMLElement, Element>();

const INSET = 8;
const SPOT_SPACING = 24;
// The highlight is drawn 5px outside its target.
const HIGHLIGHT_RING = 6;
const CONTROL_GAP = 4;

// What the student acts on, plus the live counts that show what acting did.
const IN_THE_WAY = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="status"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function overlap(a: Area, b: Area): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * The parts of a step's targets the box mustn't hide. A list that scrolls is
 * mostly empty space until it fills up, and judging it as one block leaves the
 * box nowhere to go, so a scroller counts as the rows showing in it.
 */
function targetAreas(box: HTMLElement, selectors: string[]): Area[] {
  return selectors.flatMap(selector => {
    const el = document.querySelector(selector);
    if (!el || box.contains(el)) return [];
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return [];

    const { overflowY } = getComputedStyle(el);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      const rows = [...el.children]
        .filter(child => !(child instanceof SVGElement))
        .map(child => {
          const r = child.getBoundingClientRect();
          return {
            left: Math.max(r.left, rect.left),
            top: Math.max(r.top, rect.top),
            right: Math.min(r.right, rect.right),
            bottom: Math.min(r.bottom, rect.bottom),
          };
        })
        .filter(r => r.right > r.left && r.bottom > r.top);
      if (rows.length > 0) return rows;
    }
    return [
      {
        left: rect.left - HIGHLIGHT_RING,
        top: rect.top - HIGHLIGHT_RING,
        right: rect.right + HIGHLIGHT_RING,
        bottom: rect.bottom + HIGHLIGHT_RING,
      },
    ];
  });
}

/** What the student could click right now, so not whatever a window is hiding. */
function reachableControls(box: HTMLElement): Area[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const controls: Area[] = [];
  for (const el of document.querySelectorAll(IN_THE_WAY)) {
    if (box.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const x = (Math.max(r.left, 0) + Math.min(r.right, vw)) / 2;
    const y = (Math.max(r.top, 0) + Math.min(r.bottom, vh)) / 2;
    if (x < 0 || x >= vw || y < 0 || y >= vh) continue;
    const onTop = document
      .elementsFromPoint(x, y)
      .find(at => !box.contains(at));
    if (onTop && el.contains(onTop)) {
      controls.push({
        left: r.left - CONTROL_GAP,
        top: r.top - CONTROL_GAP,
        right: r.right + CONTROL_GAP,
        bottom: r.bottom + CONTROL_GAP,
      });
    }
  }
  return controls;
}

/** Whether the box sits on anything the current step points at. */
export function coversTarget(box: HTMLElement, selectors: string[]): boolean {
  const area = boxArea(box);
  return targetAreas(box, selectors).some(a => overlap(area, a) > 0);
}

/** Changes when the targets move or the box changes size. */
export function layoutKey(box: HTMLElement, selectors: string[]): string {
  const areas = targetAreas(box, selectors).map(
    a => `${a.left},${a.top},${a.right},${a.bottom}`,
  );
  return [box.offsetWidth, box.offsetHeight, ...areas].join('|');
}

/**
 * Move the box to the spot that gets in the way least. In order, a spot should:
 * clear the step's targets, cover as few things the student can click as
 * possible, cover as little of the targets as it must when none is clear, and sit
 * outside the open window as far as it can. Staying put wins any tie, because a
 * box that jumps between steps loses the student's place and moves Next out from
 * under the pointer. For the same reason the window only sets where the box goes
 * when that window arrives: within it, the box moves only to uncover something.
 * All of which makes this safe to call repeatedly, since once placed nothing else
 * beats the current spot.
 *
 * Reads hundreds of rects, so it's for when the layout has changed. Use
 * `coversTarget` to watch between times. `onlyOffTarget` is for a box the student
 * dragged: their spot stands unless it's on what the step needs.
 */
export function placeBox(
  box: HTMLElement,
  selectors: string[],
  { onlyOffTarget = false } = {},
): void {
  if (onlyOffTarget && !coversTarget(box, selectors)) return;
  const targets = targetAreas(box, selectors);
  const here = boxArea(box);

  const controls = reachableControls(box);
  const openWindow = [...document.querySelectorAll('[role="dialog"]')]
    .filter(el => !box.contains(el))
    .at(-1);
  const windowArea = openWindow?.getBoundingClientRect();
  const settledInWindow = openWindow && placedIn.get(box) === openWindow;
  if (openWindow) placedIn.set(box, openWindow);
  else placedIn.delete(box);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = box.offsetWidth;
  const height = box.offsetHeight;
  const quarterOfBox = (width * height) / 4;

  const score = (left: number, top: number, staying: boolean): number[] => {
    const spot = { left, top, right: left + width, bottom: top + height };
    const tucked =
      Math.min(left, vw - spot.right) + Math.min(top, vh - spot.bottom);
    return [
      targets.some(a => overlap(spot, a) > 0) ? 1 : 0,
      controls.filter(c => overlap(spot, c) > 0).length,
      targets.reduce((sum, a) => sum + overlap(spot, a), 0),
      windowArea && !(staying && settledInWindow)
        ? Math.round(overlap(spot, windowArea) / quarterOfBox)
        : 0,
      staying ? -1 : tucked,
    ];
  };
  const beats = (a: number[], b: number[]) => {
    const i = a.findIndex((n, at) => n !== b[at]);
    return i >= 0 && (a[i] ?? 0) < (b[i] ?? 0);
  };

  const positions = (max: number) => {
    const end = Math.max(INSET, max);
    const at = [end];
    for (let p = INSET; p < end; p += SPOT_SPACING) at.push(p);
    return at;
  };

  let best = { left: here.left, top: here.top };
  let bestScore = score(best.left, best.top, true);
  for (const top of positions(vh - height - INSET)) {
    for (const left of positions(vw - width - INSET)) {
      const candidate = score(left, top, false);
      if (beats(candidate, bestScore)) {
        best = { left, top };
        bestScore = candidate;
      }
    }
  }

  if (best.left === here.left && best.top === here.top) return;
  box.style.left = `${best.left}px`;
  box.style.top = `${best.top}px`;
  box.style.bottom = 'auto';
}
