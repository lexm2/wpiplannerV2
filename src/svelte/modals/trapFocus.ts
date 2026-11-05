/**
 * Svelte action for the modal dialog: trap Tab focus within the dialog, move
 * focus into it on open, restore focus to the previously-focused element on
 * close, and lock body scroll while any modal is open.
 *
 * Centralized here so every modal gets correct focus management from Modal.svelte
 * without each one re-implementing it. Stacking-safe: the scroll lock is
 * reference-counted, and each instance restores the element that was focused when
 * it opened (so nested modals restore in LIFO order).
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Reference count so the body scroll lock is released only when the LAST open
// modal unmounts.
let lockCount = 0;
let priorBodyOverflow = '';

// Each open dialog's restore candidates, nearest first. A modal opened while
// another was closing (Next in the auto-schedule intro, Tutorials in the
// picker) captures a button inside the closing one, which is gone by the time
// it closes; it falls back to what the closing modal would have restored.
const restoreTargets = new Map<HTMLElement, HTMLElement[]>();

function focusableWithin(node: HTMLElement): HTMLElement[] {
  return [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    el =>
      el.offsetWidth > 0 ||
      el.offsetHeight > 0 ||
      el === document.activeElement,
  );
}

// The tutorial box floats above every dialog, and on a step that explains a
// window rather than asking for a click in it, its Next is the only way on. So
// it joins the Tab cycle of whichever dialog is on top.
function tabStops(node: HTMLElement): HTMLElement[] {
  const box = document.querySelector<HTMLElement>('[data-tutorial-box]');
  return [...focusableWithin(node), ...(box ? focusableWithin(box) : [])];
}

export function trapFocus(node: HTMLElement) {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const owner = previouslyFocused
    ? [...restoreTargets.keys()].find(n => n.contains(previouslyFocused))
    : undefined;
  const candidates = [
    ...(previouslyFocused ? [previouslyFocused] : []),
    ...((owner && restoreTargets.get(owner)) ?? []),
  ];
  restoreTargets.set(node, candidates);

  if (lockCount === 0) {
    priorBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount++;

  // Move focus into the dialog: prefer an explicit autofocus target, else the
  // first focusable, else the dialog itself (made programmatically focusable).
  const initial =
    node.querySelector<HTMLElement>('[autofocus]') ?? focusableWithin(node)[0];
  if (initial) {
    initial.focus();
  } else {
    node.tabIndex = -1;
    node.focus();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Tab' || e.defaultPrevented) return;
    if ([...restoreTargets.keys()].pop() !== node) return;
    const stops = tabStops(node);
    if (stops.length === 0) {
      e.preventDefault();
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const at = active ? stops.indexOf(active) : -1;
    // Focus sits somewhere the list doesn't name, like the dialog itself: inside
    // the dialog Tab can carry on from there, outside it comes back in.
    if (at === -1 && node.contains(active)) return;

    const following = stops[at + (e.shiftKey ? -1 : 1)];
    const wraps = at === -1 || following === undefined;
    const next = wraps ? stops.at(e.shiftKey ? -1 : 0)! : following;
    // Within the dialog the browser's own order stands; only wrapping round or
    // crossing to the tutorial box needs steering.
    if (wraps || node.contains(active) !== node.contains(next)) {
      e.preventDefault();
      next.focus();
    }
  }

  // On document, not the dialog, to also hear Tab from the tutorial box.
  document.addEventListener('keydown', onKeydown);

  return {
    destroy(): void {
      document.removeEventListener('keydown', onKeydown);
      restoreTargets.delete(node);
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = priorBodyOverflow;
      }
      // preventScroll, because a modal can hand work to the page behind it:
      // the course finder closes and asks the bucket list to scroll a card into
      // view. A bare focus() scrolls the restored element back into view too,
      // and since the restore lands after the outro - a good 200ms into that
      // smooth scroll - it would yank the pane back where it started.
      //
      // Only when focus is still ours to hand back: on <body> (where removing
      // the focused dialog leaves it) or inside this dialog. Otherwise a modal
      // that opened as this one closed already has it.
      const active = document.activeElement;
      if (active && active !== document.body && !node.contains(active)) return;
      // With another dialog still open, focus belongs inside the topmost one:
      // a candidate behind it (say the button that opened it, when the row
      // that opened this dialog was just deleted) would let Tab walk the page.
      const top = [...restoreTargets.keys()].pop();
      const target = top
        ? (candidates.find(el => el.isConnected && top.contains(el)) ??
          focusableWithin(top)[0] ??
          top)
        : candidates.find(el => el.isConnected);
      if (target === top && top) top.tabIndex = -1;
      target?.focus?.({ preventScroll: true });
    },
  };
}
