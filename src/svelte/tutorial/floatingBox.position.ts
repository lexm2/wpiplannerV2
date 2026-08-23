/**
 * DOM positioning helpers for the tutorial floating box - extracted from
 * FloatingTextBox.svelte so the component keeps only its reactive glue. All
 * operate on a passed `box` element and read live layout; none touch component
 * state.
 */

/** Nudge the box back inside the viewport (8px inset) if it overflows any edge. */
export function clampToViewport(box: HTMLElement): void {
  const rect = box.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = rect.left;
  let top = rect.top;

  if (rect.bottom > vh) top = vh - rect.height - 8;
  if (top < 0) top = 8;
  if (rect.right > vw) left = vw - rect.width - 8;
  if (rect.left < 0) left = 8;

  if (left !== rect.left || top !== rect.top) {
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.bottom = 'auto';
  }
}

/**
 * If the box overlaps the highlighted target, move it to the first viewport
 * corner that clears the target. If the target isn't mounted or laid out yet,
 * watch for it (bounded to 1s) and retry - a step's target is routinely still
 * being built by that same step's state transition when this first runs. Pass
 * `waitForTarget: false` from repeat callers (scroll/resize) so only the once-per-
 * step call arms that watcher.
 */
export function repositionIfObstructed(
  box: HTMLElement,
  selector: string,
  waitForTarget = true,
): void {
  const target = document.querySelector(selector) as HTMLElement | null;
  if (target && box.contains(target)) return;

  const targetRect = target?.getBoundingClientRect();

  if (!targetRect || (targetRect.width === 0 && targetRect.height === 0)) {
    if (!waitForTarget) return;
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      obs.disconnect();
      repositionIfObstructed(box, selector);
      clampToViewport(box);
    });
    obs.observe(document.body, {
      childList: true,
      attributes: true,
      subtree: true,
      attributeFilter: ['class', 'style'],
    });
    setTimeout(() => obs.disconnect(), 1000);
    return;
  }

  const boxRect = box.getBoundingClientRect();
  const overlaps = (a: DOMRect, b: DOMRect) =>
    !(
      a.right < b.left ||
      a.left > b.right ||
      a.bottom < b.top ||
      a.top > b.bottom
    );

  if (!overlaps(boxRect, targetRect)) return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const boxW = boxRect.width;
  const boxH = boxRect.height;

  const candidates = [
    { left: 20, top: vh - boxH - 20 },
    { left: vw - boxW - 20, top: vh - boxH - 20 },
    { left: vw - boxW - 20, top: 20 },
    { left: 20, top: 20 },
  ];

  for (const pos of candidates) {
    const candidate = new DOMRect(pos.left, pos.top, boxW, boxH);
    if (!overlaps(candidate, targetRect)) {
      box.style.left = `${pos.left}px`;
      box.style.top = `${pos.top}px`;
      box.style.bottom = 'auto';
      return;
    }
  }
}

/**
 * Decorate any `.tutorial-inline-highlight` spans inside the step description with
 * the marching-ants dashed-rect SVG (sized to each span). Kept as SVG - the
 * dashoffset animation is exactly what CSS approximates poorly.
 */
export function decorateInlineHighlights(descEl: HTMLElement): void {
  descEl
    .querySelectorAll<HTMLElement>('.tutorial-inline-highlight')
    .forEach(span => {
      if (span.querySelector('svg')) return;
      const w = span.offsetWidth + 4;
      const h = span.offsetHeight + 4;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', String(w));
      svg.setAttribute('height', String(h));
      const rect = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'rect',
      );
      rect.setAttribute('x', '1');
      rect.setAttribute('y', '1');
      rect.setAttribute('rx', '4');
      rect.setAttribute('width', String(w - 2));
      rect.setAttribute('height', String(h - 2));
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke-width', '2');
      rect.setAttribute('stroke-dasharray', '8 6');
      svg.appendChild(rect);
      span.insertBefore(svg, span.firstChild);
    });
}
