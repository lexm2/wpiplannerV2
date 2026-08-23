<script lang="ts">
  import { clampWidth, type PanelWidthConfig } from './panelWidths';

  interface Props {
    config: PanelWidthConfig;
    /** Which edge of the parent panel the handle sits on. */
    edge: 'left' | 'right';
    /** Accessible label for the separator. */
    label?: string;
  }

  let { config, edge, label = 'Resize panel' }: Props = $props();

  let dragging = $state(false);
  let startX = 0;
  let startWidth = 0;

  function currentWidth(handle: HTMLElement): number {
    const panel = handle.parentElement;
    if (panel) return panel.getBoundingClientRect().width;
    const raw = getComputedStyle(document.documentElement).getPropertyValue(
      config.cssVar,
    );
    return Number.parseFloat(raw) || config.defaultWidth;
  }

  function setWidth(width: number): number {
    const w = clampWidth(config, width);
    document.documentElement.style.setProperty(config.cssVar, `${w}px`);
    return w;
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const handle = e.currentTarget as HTMLElement;
    dragging = true;
    startX = e.clientX;
    startWidth = currentWidth(handle);
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort; dragging still works without it */
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragging) return;
    const delta = e.clientX - startX;
    setWidth(edge === 'right' ? startWidth + delta : startWidth - delta);
  }

  function onPointerUp(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    const handle = e.currentTarget as HTMLElement;
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch {
      /* no-op if capture was never established */
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const w = currentWidth(handle);
    localStorage.setItem(config.storageKey, String(Math.round(w)));
  }

  function reset(): void {
    setWidth(config.defaultWidth);
    localStorage.removeItem(config.storageKey);
  }

  function onKeyDown(e: KeyboardEvent): void {
    const step = e.shiftKey ? 32 : 8;
    const handle = e.currentTarget as HTMLElement;
    const base = currentWidth(handle);
    if (e.key === 'ArrowLeft') {
      setWidth(edge === 'right' ? base - step : base + step);
    } else if (e.key === 'ArrowRight') {
      setWidth(edge === 'right' ? base + step : base - step);
    } else if (e.key === 'Home') {
      reset();
    } else {
      return;
    }
    localStorage.setItem(
      config.storageKey,
      String(Math.round(currentWidth(handle))),
    );
    e.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="resize-handle resize-handle--{edge}"
  class:dragging
  role="separator"
  aria-orientation="vertical"
  aria-label={label}
  tabindex="0"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  ondblclick={reset}
  onkeydown={onKeyDown}
></div>

<style>
  .resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 8px;
    z-index: 5;
    cursor: col-resize;
    touch-action: none;
    /* Straddle the panel border so the whole seam is grabbable. */
  }

  .resize-handle--right {
    right: -4px;
  }

  .resize-handle--left {
    left: -4px;
  }

  /* Visible accent line, centered in the hit area. */
  .resize-handle::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 2px;
    background: transparent;
    transition: background 0.12s ease;
  }

  .resize-handle:hover::after,
  .resize-handle:focus-visible::after,
  .resize-handle.dragging::after {
    background: var(--color-primary);
  }

  .resize-handle:focus-visible {
    outline: none;
  }
</style>
