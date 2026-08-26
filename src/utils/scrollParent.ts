/**
 * The nearest ancestor that scrolls `el`, or `document.documentElement` when
 * nothing between them does and the page itself is the scroller.
 *
 * Two callers need this and they must agree: the tutorial points its off-screen
 * arrow at whichever box actually clips the target, and the course list's
 * infinite-scroll sentinel hands the same box to its IntersectionObserver as
 * `root`. A second copy of the walk would be a quiet way for those two to
 * disagree about what "off screen" means.
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
