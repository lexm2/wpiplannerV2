import { cubicIn, cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

/**
 * Shared custom enter/exit transitions - the single home for all such motion
 * in the app.
 *
 * Svelte transitions don't auto-respect prefers-reduced-motion, so every
 * duration runs through dur(); components using built-ins (fade/fly/slide)
 * or animate:flip should wrap their durations in dur() too.
 */

// Snapshot at load - cheap, and nobody toggles this mid-session.
export const reduceMotion =
  typeof matchMedia !== 'undefined' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Zero a duration under prefers-reduced-motion. */
export function dur(ms: number): number {
  return reduceMotion ? 0 : ms;
}

/**
 * Like `slide` (animates the full vertical box so the container resizes
 * smoothly) plus a fade. No `transform`, so it won't fight `animate:flip`.
 */
export function slideFade(
  node: Element,
  { duration = 260, delay = 0 } = {},
): TransitionConfig {
  const style = getComputedStyle(node);
  const height = parseFloat(style.height);
  // In a hidden subtree (a page kept mounted but display:none) computed
  // sizes come back "auto" → NaN; nothing is visible, so skip rather than
  // emit NaNpx keyframes.
  if (!Number.isFinite(height)) return { duration: 0 };
  const px = (v: string) => parseFloat(v) || 0;
  const opacity = +style.opacity || 0;
  const paddingTop = px(style.paddingTop);
  const paddingBottom = px(style.paddingBottom);
  const marginTop = px(style.marginTop);
  const marginBottom = px(style.marginBottom);
  const borderTop = px(style.borderTopWidth);
  const borderBottom = px(style.borderBottomWidth);
  return {
    duration: dur(duration),
    delay,
    easing: cubicOut,
    css: (t: number) =>
      `overflow: hidden;` +
      `opacity: ${t * opacity};` +
      `height: ${t * height}px;` +
      `padding-top: ${t * paddingTop}px;` +
      `padding-bottom: ${t * paddingBottom}px;` +
      `margin-top: ${t * marginTop}px;` +
      `margin-bottom: ${t * marginBottom}px;` +
      `border-top-width: ${t * borderTop}px;` +
      `border-bottom-width: ${t * borderBottom}px;`,
  };
}

/**
 * Horizontal slide + fade measured in percent of the element's own width
 * (`from: 1` enters from the right, `-1` from the left). Percent-based so the
 * wizard's full-width step slides don't need pixel measurements.
 */
export function slideX(
  _node: Element,
  { duration = 250, delay = 0, from = 1 } = {},
): TransitionConfig {
  return {
    duration: dur(duration),
    delay,
    easing: cubicOut,
    css: (t: number, u: number) =>
      `transform: translateX(${u * from * 100}%); opacity: ${t};`,
  };
}

/**
 * Modal enter/exit timing, shared by `scrim` and `riseFade` below so the two
 * halves stay choreographed. Entering is slower and eased out, so the modal
 * settles into place; leaving is faster and eased in, so dismissal feels
 * immediate rather than something you wait on.
 */
const MODAL_IN = 280;
const MODAL_OUT = 180;
/**
 * How far the dialog trails the backdrop on the way in - and, applied to the
 * backdrop instead, how far the backdrop trails the dialog on the way out.
 * The room dims, then the card arrives; the card leaves, then the room lifts.
 */
const MODAL_STAGGER = 40;

/**
 * Both modal transitions return a *function* of `{ direction }` rather than a
 * config. That is Svelte's deferred-transition form, and it is the only way to
 * give the two halves different durations and easings from a single
 * `transition:` directive - which in turn is the only way Svelte will reverse
 * an interrupted transition smoothly. Split `in:`/`out:` directives are two
 * unrelated managers, so closing mid-open snaps to fully-open first.
 *
 * Svelte always passes `direction` at runtime; the argument is optional only
 * because svelte2tsx types the deferred form as a zero-argument function.
 */
type Deferred = (opts?: { direction: 'in' | 'out' }) => TransitionConfig;

/**
 * Modal backdrop darken. Animates the element's own `background-color` alpha
 * rather than its `opacity`, because an opacity fade multiplies into the
 * entire subtree - and the dialog inside needs its own independent fade so the
 * two can be staggered against each other.
 *
 * The target alpha is read off the node once, before any transition style has
 * been applied, so modal.css's `prefers-contrast: high` override (0.8 instead
 * of 0.5) is picked up for free.
 */
export function scrim(node: Element): Deferred {
  const parsed = /rgba?\(([^)]+)\)/
    .exec(getComputedStyle(node).backgroundColor)?.[1]
    .split(',')
    .map(parseFloat);
  const [r, g, b] = parsed ?? [0, 0, 0];
  // `rgb(...)`, with no alpha component, means fully opaque.
  const alpha = parsed && parsed.length > 3 ? parsed[3] : 1;

  return opts => {
    const inbound = opts?.direction !== 'out';
    return {
      duration: dur(inbound ? MODAL_IN : MODAL_OUT),
      delay: dur(inbound ? 0 : MODAL_STAGGER),
      easing: inbound ? cubicOut : cubicIn,
      css: (t: number) =>
        `background-color: rgba(${r}, ${g}, ${b}, ${t * alpha});`,
    };
  };
}

/**
 * Modal dialog enter/exit: fades while rising into place, with a slight scale
 * so it reads as arriving rather than sliding.
 *
 * `transform: false` drops the rise and scale, leaving the fade alone, for
 * dialogs that must never carry a transform - a transformed element becomes
 * the containing block for its `position: fixed` descendants. Opacity is safe
 * there: it creates a stacking context, not a containing block.
 */
export function riseFade(
  _node: Element,
  { y = 20, from = 0.97, transform = true } = {},
): Deferred {
  return opts => {
    const inbound = opts?.direction !== 'out';
    return {
      duration: dur(inbound ? MODAL_IN : MODAL_OUT),
      delay: dur(inbound ? MODAL_STAGGER : 0),
      easing: inbound ? cubicOut : cubicIn,
      css: (t: number, u: number) =>
        `opacity: ${t};` +
        (transform
          ? `transform: translateY(${u * y}px) scale(${from + (1 - from) * t});`
          : ''),
    };
  };
}

/** Small scale+fade pop for cards (replaces the old cardReveal keyframes). */
export function scaleFade(
  _node: Element,
  { duration = 300, delay = 0, from = 0.97 } = {},
): TransitionConfig {
  return {
    duration: dur(duration),
    delay,
    easing: cubicOut,
    css: (t: number) =>
      `transform: scale(${from + (1 - from) * t}); opacity: ${t};`,
  };
}
