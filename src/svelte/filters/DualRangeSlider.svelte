<script lang="ts">
  import styles from '../../styles/components/dual-range-slider.module.css';

  let {
    min,
    max,
    step,
    minValue = $bindable(),
    maxValue = $bindable(),
    leftLabel,
    rightLabel,
  }: {
    min: number;
    max: number;
    step: number;
    minValue: number;
    maxValue: number;
    leftLabel?: string;
    rightLabel?: string;
  } = $props();

  let trackEl: HTMLElement;
  let draggingLeft = $state(false);
  let draggingRight = $state(false);
  let hoverLeft = $state(false);
  let hoverRight = $state(false);

  const range = $derived(max - min);
  const minPct = $derived(((minValue - min) / range) * 100);
  const maxPct = $derived(((maxValue - min) / range) * 100);

  // Tooltip shows on hover or while dragging (matches the old imperative logic).
  const showLeftTip = $derived(hoverLeft || draggingLeft);
  const showRightTip = $derived(hoverRight || draggingRight);

  function roundToStep(value: number): number {
    return Math.round(value / step) * step;
  }

  function setMinFromPct(pct: number): void {
    let v = roundToStep(min + pct * range);
    v = Math.max(min, Math.min(maxValue, v));
    if (v !== minValue) minValue = v;
  }

  function setMaxFromPct(pct: number): void {
    let v = roundToStep(min + pct * range);
    v = Math.max(minValue, Math.min(max, v));
    if (v !== maxValue) maxValue = v;
  }

  function pctFromClientX(clientX: number): number {
    const rect = trackEl.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  // Pointer capture routes move/up back to the thumb even when the pointer
  // leaves it, so no document listeners are needed. Matches ResizeHandle.
  function onThumbDown(side: 'left' | 'right', e: PointerEvent): void {
    e.preventDefault();
    if (side === 'left') draggingLeft = true;
    else draggingRight = true;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort; dragging still works without it */
    }
  }

  function onThumbMove(e: PointerEvent): void {
    if (draggingLeft) setMinFromPct(pctFromClientX(e.clientX));
    else if (draggingRight) setMaxFromPct(pctFromClientX(e.clientX));
  }

  function onThumbUp(e: PointerEvent): void {
    if (!draggingLeft && !draggingRight) return;
    draggingLeft = false;
    draggingRight = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op if capture was never established */
    }
  }

  function onThumbKeyDown(side: 'left' | 'right', e: KeyboardEvent): void {
    const current = side === 'left' ? minValue : maxValue;
    let next = current;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        e.preventDefault();
        next = Math.max(min, current - step);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        e.preventDefault();
        next = Math.min(max, current + step);
        break;
      case 'Home':
        e.preventDefault();
        next = min;
        break;
      case 'End':
        e.preventDefault();
        next = max;
        break;
      default:
        return;
    }
    const pct = (next - min) / range;
    if (side === 'left') setMinFromPct(pct);
    else setMaxFromPct(pct);
  }

</script>

<div class={styles['dual-range-slider']}>
  <div class={styles['dual-range-track']} bind:this={trackEl}></div>
  <div
    class={styles['dual-range-bar']}
    style:left="{minPct}%"
    style:width="{maxPct - minPct}%"
  ></div>

  <div
    class="{styles['dual-range-thumb']} {styles['dual-range-thumb-left']}"
    role="slider"
    tabindex="0"
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={minValue}
    aria-label={leftLabel}
    style:left="{minPct}%"
    onpointerdown={(e) => onThumbDown('left', e)}
    onpointermove={onThumbMove}
    onpointerup={onThumbUp}
    onpointercancel={onThumbUp}
    onkeydown={(e) => onThumbKeyDown('left', e)}
    onmouseenter={() => (hoverLeft = true)}
    onmouseleave={() => (hoverLeft = false)}
  ></div>

  <div
    class="{styles['dual-range-thumb']} {styles['dual-range-thumb-right']}"
    role="slider"
    tabindex="0"
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={maxValue}
    aria-label={rightLabel}
    style:left="{maxPct}%"
    onpointerdown={(e) => onThumbDown('right', e)}
    onpointermove={onThumbMove}
    onpointerup={onThumbUp}
    onpointercancel={onThumbUp}
    onkeydown={(e) => onThumbKeyDown('right', e)}
    onmouseenter={() => (hoverRight = true)}
    onmouseleave={() => (hoverRight = false)}
  ></div>

  <div
    class="{styles['dual-range-tooltip']} {styles['dual-range-tooltip-left']}"
    style:left="{minPct}%"
    style:display={showLeftTip ? 'block' : 'none'}
  >{minValue.toFixed(1)}</div>

  <div
    class="{styles['dual-range-tooltip']} {styles['dual-range-tooltip-right']}"
    style:left="{maxPct}%"
    style:display={showRightTip ? 'block' : 'none'}
  >{maxValue.toFixed(1)}</div>
</div>
