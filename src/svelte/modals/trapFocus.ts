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
    if (e.key !== 'Tab') return;
    const focusables = focusableWithin(node);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (e.shiftKey) {
      if (active === first || !node.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !node.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }

  node.addEventListener('keydown', onKeydown);

  return {
    destroy(): void {
      node.removeEventListener('keydown', onKeydown);
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
      candidates.find(el => el.isConnected)?.focus?.({ preventScroll: true });
    },
  };
}
