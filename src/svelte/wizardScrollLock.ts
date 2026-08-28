/**
 * Resets the schedule sidebar's scroll while the wizard panel is open, and
 * restores it on close.
 *
 * The panel is absolutely positioned at top:0 inside this scroll container, so
 * if the sidebar was scrolled down the panel renders out of view and the
 * overflow lock leaves no way to reach it.
 */
export function wizardScrollLock(node: HTMLElement, isOpen: boolean) {
  let prevScrollTop = 0;

  function apply(open: boolean): void {
    if (open) {
      prevScrollTop = node.scrollTop;
      node.scrollTop = 0;
    } else {
      node.scrollTop = prevScrollTop;
    }
  }

  let current = isOpen;
  if (current) apply(true);

  return {
    update(next: boolean) {
      if (next !== current) {
        current = next;
        apply(next);
      }
    },
    destroy() {
      if (current) apply(false);
    },
  };
}
