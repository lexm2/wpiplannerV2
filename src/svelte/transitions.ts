import { cubicOut } from 'svelte/easing';
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
 * Scale-only zoom for modal dialogs - the backdrop's fade already handles
 * opacity for the whole subtree. `enabled: false` turns it into a no-op for
 * dialogs that must never carry a transform (position:fixed descendants).
 */
export function zoom(
  _node: Element,
  { duration = 200, from = 0.9, enabled = true } = {},
): TransitionConfig {
  if (!enabled) return { duration: 0 };
  return {
    duration: dur(duration),
    easing: cubicOut,
    css: (t: number) => `transform: scale(${from + (1 - from) * t});`,
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
