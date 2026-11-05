<script lang="ts">
  import {
    clampWidth,
    maxWidthNow,
    type PanelWidthConfig,
  } from './panelWidths';

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
  // Fixed for a drag: the two columns trade width, so the limit doesn't move.
  let dragMax = 0;

  let handleEl = $state<HTMLElement | null>(null);
  // Mirrored into aria-value* so a screen reader can say where the handle is.
  let valueNow = $state(0);
  let valueMax = $state(0);

  function syncValue(): void {
    if (!handleEl) return;
    const width = Math.round(currentWidth(handleEl));
    // A hidden page's panel measures 0; the next focus or hover measures it.
    if (width === 0) return;
    valueNow = width;
    valueMax = maxWidthNow(config, width);
  }

  $effect(() => {
    syncValue();
  });

  function currentWidth(handle: HTMLElement): number {
    const panel = handle.parentElement;
    if (panel) return panel.getBoundingClientRect().width;
    const raw = getComputedStyle(document.documentElement).getPropertyValue(
      config.cssVar,
    );
    return Number.parseFloat(raw) || config.defaultWidth;
  }

  function setWidth(width: number, max: number): void {
    const w = clampWidth(config, width, max);
    document.documentElement.style.setProperty(config.cssVar, `${w}px`);
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const handle = e.currentTarget as HTMLElement;
    dragging = true;
    startX = e.clientX;
    startWidth = currentWidth(handle);
    dragMax = maxWidthNow(config, startWidth);
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
    setWidth(
      edge === 'right' ? startWidth + delta : startWidth - delta,
      dragMax,
    );
    syncValue();
  }

  function clearBodyStyles(): void {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  // Ends the drag on pointerup, and also on pointercancel/lostpointercapture
  // (the browser took the pointer, e.g. for a touch gesture), so the body
  // cursor/user-select overrides never outlive the drag.
  function onPointerUp(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    const handle = e.currentTarget as HTMLElement;
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch {
      /* no-op if capture was never established */
    }
    clearBodyStyles();
    const w = currentWidth(handle);
    localStorage.setItem(config.storageKey, String(Math.round(w)));
    syncValue();
  }

  // Unmounted mid-drag (e.g. the panel closed): nothing else would clear them.
  $effect(() => () => {
    if (dragging) clearBodyStyles();
  });

  // Drop the override rather than writing defaultWidth back: the stylesheet's
  // fallback is the real default, and for the right panel it adapts to the
  // window width.
  function reset(): void {
    document.documentElement.style.removeProperty(config.cssVar);
    localStorage.removeItem(config.storageKey);
    syncValue();
  }

  function onKeyDown(e: KeyboardEvent): void {
    const step = e.shiftKey ? 32 : 8;
    const handle = e.currentTarget as HTMLElement;
    const base = currentWidth(handle);
    const max = maxWidthNow(config, base);
    if (e.key === 'ArrowLeft') {
      setWidth(edge === 'right' ? base - step : base + step, max);
    } else if (e.key === 'ArrowRight') {
      setWidth(edge === 'right' ? base + step : base - step, max);
    } else if (e.key === 'Home') {
      reset();
    } else {
      return;
    }
    localStorage.setItem(
      config.storageKey,
      String(Math.round(currentWidth(handle))),
    );
    syncValue();
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
  aria-valuenow={valueNow}
  aria-valuemin={config.min}
  aria-valuemax={valueMax}
  tabindex="0"
  bind:this={handleEl}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onlostpointercapture={onPointerUp}
  ondblclick={reset}
  onkeydown={onKeyDown}
  onfocus={syncValue}
  onpointerenter={syncValue}
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
