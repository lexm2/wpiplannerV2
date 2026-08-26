/**
 * The nearest ancestor that scrolls `el`, or `document.documentElement` when
 * nothing between them does.
 *
 * Shared so the tutorial's off-screen arrow and the course list's sentinel
 * resolve the same clipping box.
 */
export function scrollParent(el: Element): Element {
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    const { overflow, overflowY } = getComputedStyle(parent);
    if (/auto|scroll/.test(overflow + overflowY)) return parent;
    parent = parent.parentElement;
  }
  return document.documentElement;
}
