import { reduceMotion } from '../transitions';

/**
 * "Take me to that bucket" - the jump the course finder hands to the bucket
 * list.
 *
 * Split in two on purpose. The REQUEST is state, because only RequirementList
 * can make the target reachable: the card may be filtered out by the status
 * chips, or be a degree-wide aggregate the umbrella toggle is hiding, and
 * scrolling to an unrendered card would silently do nothing. The FLASH is a
 * self-contained WAAPI routine, run by that same component once it has dropped
 * whatever was hiding the card.
 *
 * A course can count toward several requirements at once, so a request names
 * every bucket to light up and the one to scroll to.
 */
export interface BucketFocusRequest {
  /** Every bucket to flash. */
  ids: string[];
  /** The one to scroll into view - the chip the user actually clicked. */
  target: string;
}

class BucketFocus {
  /** $state.raw: replaced wholesale, and a fresh object is what re-fires the jump. */
  request = $state.raw<BucketFocusRequest | null>(null);
}

export const bucketFocus = new BucketFocus();

/** Ask the bucket list to reveal, scroll to, and flash these buckets. */
export function focusBuckets(ids: string[], target?: string): void {
  const list = [...new Set(ids)].filter(Boolean);
  if (list.length === 0) return;
  bucketFocus.request = { ids: list, target: target ?? list[0] };
}

/** Handled - drop it, so a repeat click on the same bucket jumps again. */
export function clearBucketFocus(): void {
  bucketFocus.request = null;
}

/** The modal's scrim is still fading when the jump starts; let it clear first. */
const START_DELAY = 180;
const TINT_MS = 1500;
const RING_MS = 750;
/** Identifies our own animations, so a second jump replaces rather than stacks. */
const ANIM_ID = 'bucket-focus';

const cardSelector = (id: string): string =>
  `.degree-card-list [data-bucket-id="${typeof CSS !== 'undefined' ? CSS.escape(id) : id}"]`;

/**
 * Scroll to the request's target card and flash every card it names.
 *
 * Call it once the cards are *allowed* to render; it waits for them to actually
 * appear, since the filter change that revealed them lands a frame later.
 */
export function runBucketFocus(request: BucketFocusRequest): void {
  if (typeof document === 'undefined') return;

  whenPresent(cardSelector(request.target), card => {
    card.scrollIntoView({
      block: 'center',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
    for (const id of request.ids) {
      const el = document.querySelector<HTMLElement>(cardSelector(id));
      if (el) flash(el);
    }
  });
}

/**
 * rAF-poll for an element that is about to render. Not driving an animation -
 * this is the DOM-readiness use rAF is still for.
 */
function whenPresent(selector: string, run: (el: HTMLElement) => void): void {
  if (typeof requestAnimationFrame !== 'function') return;
  let tries = 0;
  const tick = (): void => {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      run(el);
      return;
    }
    if (tries++ < 12) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** The three channel values of an `rgb()`/`rgba()` string or a bare "r, g, b" token. */
function channels(value: string): [number, number, number] | null {
  const parts = value.match(/\d+(?:\.\d+)?/g);
  if (!parts || parts.length < 3) return null;
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

const blend = (
  base: [number, number, number],
  accent: [number, number, number],
  amount: number,
): string =>
  `rgb(${base.map((c, i) => Math.round(c + (accent[i] - c) * amount)).join(', ')})`;

/**
 * An accent wash plus two expanding rings.
 *
 * Both colours are resolved from the live computed style rather than written as
 * `var()` keyframes - WAAPI parses keyframe values without the element's custom
 * properties, so a `var()` there would drop the whole keyframe. Reading them per
 * flash is also what keeps it theme-correct after a theme switch.
 *
 * No `fill`, so the card returns to its own painted state on its own; nothing to
 * commit and nothing to clean up.
 */
function flash(el: HTMLElement): void {
  if (typeof el.animate !== 'function') return;
  for (const anim of el.getAnimations()) {
    if (anim.id === ANIM_ID) anim.cancel();
  }

  const style = getComputedStyle(el);
  const accent = channels(style.getPropertyValue('--color-primary-rgb')) ?? [
    212, 66, 79,
  ];
  const surface = channels(style.backgroundColor) ?? [255, 255, 255];
  const base = blend(surface, accent, 0);
  // 0.15 is --color-primary-background's own alpha in every theme, so the wash
  // lands on exactly the shade a card takes while a course is dragged over it.
  const tint = blend(surface, accent, 0.15);

  // Under reduced motion the wash snaps on and off instead of fading, but it
  // still holds: the point of the flash is to say WHICH card, and dropping it
  // would leave the jump with nothing to show for itself.
  const fade = reduceMotion ? 0 : 0.08;
  const wash = el.animate(
    [
      { backgroundColor: base, offset: 0 },
      { backgroundColor: tint, offset: fade },
      { backgroundColor: tint, offset: 1 - fade },
      { backgroundColor: base, offset: 1 },
    ],
    { duration: TINT_MS, delay: START_DELAY, easing: 'ease-out' },
  );
  wash.id = ANIM_ID;

  if (reduceMotion) return;
  const ring = el.animate(
    [
      { boxShadow: `0 0 0 0 rgba(${accent.join(', ')}, 0.55)` },
      { boxShadow: `0 0 0 14px rgba(${accent.join(', ')}, 0)` },
    ],
    {
      duration: RING_MS,
      delay: START_DELAY,
      iterations: 2,
      easing: 'ease-out',
    },
  );
  ring.id = ANIM_ID;
}
