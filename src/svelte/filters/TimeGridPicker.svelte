<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { TimeUtils } from '../../utils/timeUtils';
  import type { TimeGridMode, TimeWindow } from '../../types/filters';
  import {
    CELL_MINUTES,
    GRID_DAYS,
    GRID_START_MIN,
    ROWS_PER_DAY,
    cellIndex,
    cellsFromWindows,
    describeWindows,
    rowStartMin,
    windowsFromCells,
  } from '../../utils/timeWindows';
  import styles from '../../styles/components/time-grid.module.css';

  let {
    windows,
    mode: initialMode = 'only',
    onchange,
    toolbarExtra,
  }: {
    windows: TimeWindow[];
    mode?: TimeGridMode;
    onchange: (mode: TimeGridMode, windows: TimeWindow[]) => void;
    /** Rendered at the right of the toolbar, where it stays above the fold. */
    toolbarExtra?: Snippet;
  } = $props();

  type Cell = { dayIndex: number; row: number };
  type Rect = { d0: number; d1: number; r0: number; r1: number };
  type Brush = 'paint' | 'erase';

  // Seeded once: the modal mounts fresh on every open, and nothing else can
  // edit the criteria while it is on top.
  let cells = $state.raw<Set<number>>(untrack(() => cellsFromWindows(windows)));
  let gridMode = $state<TimeGridMode>(untrack(() => initialMode));

  // Drag is a rectangle from an anchor cell, so a fast flick can never skip
  // cells the way sampled free-painting would.
  let dragRect = $state.raw<Rect | null>(null);
  let anchor: Cell | null = null;
  let brush: Brush = 'paint';

  let focusCell = $state<Cell>({ dayIndex: 0, row: 0 });
  let showFocus = $state(false);
  let keyBrush: Brush | null = null;

  let bodyEl = $state<HTMLDivElement | null>(null);

  const painted = $derived(
    dragRect ? applyRect(cells, dragRect, brush) : cells,
  );
  const previewWindows = $derived(windowsFromCells(painted));
  const summary = $derived(describeWindows(previewWindows, gridMode));

  const hours = Array.from({ length: TimeUtils.TOTAL_TIME_SLOTS }, (_, i) => i);

  function hourLabel(i: number): string {
    return TimeUtils.formatTime({
      hours: TimeUtils.START_HOUR + i,
      minutes: 0,
      displayTime: '',
    });
  }

  function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(v, hi));
  }

  function rectOf(a: Cell, b: Cell): Rect {
    return {
      d0: Math.min(a.dayIndex, b.dayIndex),
      d1: Math.max(a.dayIndex, b.dayIndex),
      r0: Math.min(a.row, b.row),
      r1: Math.max(a.row, b.row),
    };
  }

  function applyRect(
    base: ReadonlySet<number>,
    rect: Rect,
    which: Brush,
  ): Set<number> {
    const next = new Set(base);
    for (let d = rect.d0; d <= rect.d1; d++) {
      for (let r = rect.r0; r <= rect.r1; r++) {
        if (which === 'paint') next.add(cellIndex(d, r));
        else next.delete(cellIndex(d, r));
      }
    }
    return next;
  }

  /**
   * The pixel->time inverse. Measured against the gapless body, so the row is
   * exact rather than drifting with interior gridline gaps. Clamping (rather
   * than bailing) means dragging past an edge extends to that edge.
   */
  function cellAt(clientX: number, clientY: number): Cell {
    const r = bodyEl!.getBoundingClientRect();
    return {
      dayIndex: clamp(
        Math.floor(((clientX - r.left) / r.width) * GRID_DAYS.length),
        0,
        GRID_DAYS.length - 1,
      ),
      row: clamp(
        Math.floor(((clientY - r.top) / r.height) * ROWS_PER_DAY),
        0,
        ROWS_PER_DAY - 1,
      ),
    };
  }

  /** Single write path. Never called from pointermove - only on commit. */
  function commit(next: Set<number>): void {
    cells = next;
    onchange(gridMode, windowsFromCells(cells));
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || !bodyEl) return;
    e.preventDefault();
    const cell = cellAt(e.clientX, e.clientY);
    anchor = cell;
    focusCell = cell;
    // Starting on a painted cell erases; starting on an empty one paints. A
    // zero-distance drag is then click-to-toggle, with no separate handler.
    brush = cells.has(cellIndex(cell.dayIndex, cell.row)) ? 'erase' : 'paint';
    dragRect = rectOf(cell, cell);
    try {
      bodyEl.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a convenience; the window-level up handler still commits.
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (!anchor || !bodyEl) return;
    dragRect = rectOf(anchor, cellAt(e.clientX, e.clientY));
  }

  function endDrag(e: PointerEvent): void {
    if (!anchor) return;
    if (dragRect) commit(applyRect(cells, dragRect, brush));
    anchor = null;
    dragRect = null;
    try {
      bodyEl?.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
  }

  function toggleColumn(dayIndex: number): void {
    const full = Array.from({ length: ROWS_PER_DAY }, (_, r) =>
      cellIndex(dayIndex, r),
    );
    const allPainted = full.every(i => cells.has(i));
    const next = new Set(cells);
    for (const i of full) {
      if (allPainted) next.delete(i);
      else next.add(i);
    }
    commit(next);
  }

  /** One label covers an hour, which is two 30-minute rows. */
  function toggleHour(hourIndex: number): void {
    const rows = [hourIndex * 2, hourIndex * 2 + 1];
    const full = GRID_DAYS.flatMap((_, d) => rows.map(r => cellIndex(d, r)));
    const allPainted = full.every(i => cells.has(i));
    const next = new Set(cells);
    for (const i of full) {
      if (allPainted) next.delete(i);
      else next.add(i);
    }
    commit(next);
  }

  function setMode(next: TimeGridMode): void {
    gridMode = next;
    onchange(gridMode, windowsFromCells(cells));
  }

  function clearAll(): void {
    commit(new Set());
  }

  function moveFocus(dDay: number, dRow: number, extend: boolean): void {
    if (extend && keyBrush === null) {
      // Same rule as the pointer: the cell the run starts on decides.
      keyBrush = cells.has(cellIndex(focusCell.dayIndex, focusCell.row))
        ? 'erase'
        : 'paint';
      commit(applyRect(cells, rectOf(focusCell, focusCell), keyBrush));
    }
    focusCell = {
      dayIndex: clamp(focusCell.dayIndex + dDay, 0, GRID_DAYS.length - 1),
      row: clamp(focusCell.row + dRow, 0, ROWS_PER_DAY - 1),
    };
    if (extend && keyBrush) {
      commit(applyRect(cells, rectOf(focusCell, focusCell), keyBrush));
    }
  }

  function onKeyDown(e: KeyboardEvent): void {
    const extend = e.shiftKey;
    if (!extend) keyBrush = null;

    switch (e.key) {
      case 'ArrowUp':
        moveFocus(0, -1, extend);
        break;
      case 'ArrowDown':
        moveFocus(0, 1, extend);
        break;
      case 'ArrowLeft':
        moveFocus(-1, 0, extend);
        break;
      case 'ArrowRight':
        moveFocus(1, 0, extend);
        break;
      case 'Home':
        focusCell = { ...focusCell, row: 0 };
        break;
      case 'End':
        focusCell = { ...focusCell, row: ROWS_PER_DAY - 1 };
        break;
      case 'PageUp':
        focusCell = {
          ...focusCell,
          dayIndex: clamp(focusCell.dayIndex - 1, 0, GRID_DAYS.length - 1),
        };
        break;
      case 'PageDown':
        focusCell = {
          ...focusCell,
          dayIndex: clamp(focusCell.dayIndex + 1, 0, GRID_DAYS.length - 1),
        };
        break;
      case ' ':
      case 'Enter': {
        const i = cellIndex(focusCell.dayIndex, focusCell.row);
        commit(
          applyRect(
            cells,
            rectOf(focusCell, focusCell),
            cells.has(i) ? 'erase' : 'paint',
          ),
        );
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  }

  function topPct(startMin: number): string {
    return `${((startMin - GRID_START_MIN) / (ROWS_PER_DAY * CELL_MINUTES)) * 100}%`;
  }

  function heightPct(startMin: number, endMin: number): string {
    return `${((endMin - startMin) / (ROWS_PER_DAY * CELL_MINUTES)) * 100}%`;
  }
</script>

<div class={styles.wrap}>
  <div class={styles.toolbar}>
    <div class="filter-segmented-control">
      <button
        type="button"
        class="segmented-btn"
        class:active={gridMode === 'only'}
        onclick={() => setMode('only')}>Only these times</button
      >
      <button
        type="button"
        class="segmented-btn"
        class:active={gridMode === 'avoid'}
        onclick={() => setMode('avoid')}>Avoid these times</button
      >
    </div>
    {@render toolbarExtra?.()}
  </div>

  <div class={styles.grid}>
    <div class="time-label {styles.corner}"></div>
    {#each GRID_DAYS as day, i (day)}
      <button
        type="button"
        class="day-header {styles.headerBtn}"
        title={`Select all of ${TimeUtils.getDayName(day)}`}
        onclick={() => toggleColumn(i)}>{TimeUtils.getDayAbbr(day)}</button
      >
    {/each}

    {#each hours as hour (hour)}
      <button
        type="button"
        class="time-label {styles.labelBtn}"
        style:grid-column="1"
        style:grid-row={hour + 2}
        title={`Select ${hourLabel(hour)} on every day`}
        onclick={() => toggleHour(hour)}>{hourLabel(hour)}</button
      >
    {/each}

    <div
      bind:this={bodyEl}
      class={styles.body}
      role="grid"
      tabindex="0"
      aria-label="Weekly time grid. Arrow keys move, space toggles, shift and arrow keys paint."
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={endDrag}
      onpointercancel={endDrag}
      onlostpointercapture={endDrag}
      onkeydown={onKeyDown}
      onfocus={() => (showFocus = true)}
      onblur={() => {
        showFocus = false;
        keyBrush = null;
      }}
    >
      {#each previewWindows as w (`${w.day}-${w.startMin}`)}
        <div
          class="{styles.painted} {gridMode === 'only'
            ? styles.paintedOnly
            : styles.paintedAvoid}"
          style:left="{GRID_DAYS.indexOf(w.day) * 20}%"
          style:width="20%"
          style:top={topPct(w.startMin)}
          style:height={heightPct(w.startMin, w.endMin)}
        ></div>
      {/each}

      {#if showFocus}
        <div
          class={styles.focusRing}
          style:left="{focusCell.dayIndex * 20}%"
          style:width="20%"
          style:top={topPct(rowStartMin(focusCell.row))}
          style:height={heightPct(0, CELL_MINUTES)}
        ></div>
      {/if}
    </div>
  </div>

  <div class={styles.summary}>
    <span class={styles.summaryText} aria-live="polite">{summary}</span>
    {#if previewWindows.length > 0}
      <button type="button" class="filter-clear-btn" onclick={clearAll}
        >Clear</button
      >
    {/if}
  </div>

  <p class={styles.hint}>
    Drag to select. Drag again over a selection to erase it, or click a day or
    hour label to toggle the whole row or column.
  </p>
</div>
