<script lang="ts">
  import { untrack } from 'svelte';
  import { TimeUtils } from '../../utils/timeUtils';
  import type { TimeGridMode, TimeWindow } from '../../types/filters';
  import { gridHours, hourLabel, type GridRange } from '../../utils/gridRange';
  import {
    CELL_MINUTES,
    GRID_DAYS,
    cellIndex as cellIndexIn,
    cellsFromWindows,
    describeWindows,
    rowCount,
    rowStartMin,
    windowsFromCells,
  } from '../../utils/timeWindows';
  import styles from '../../styles/components/time-grid.module.css';

  let {
    windows,
    range: initialRange,
    mode: initialMode = 'only',
    onchange,
  }: {
    windows: TimeWindow[];
    /** The hours shown; fixed while the picker is open. */
    range: GridRange;
    mode?: TimeGridMode;
    onchange: (mode: TimeGridMode, windows: TimeWindow[]) => void;
  } = $props();

  type Cell = { dayIndex: number; row: number };
  type Rect = { d0: number; d1: number; r0: number; r1: number };
  type Brush = 'paint' | 'erase';

  // Cells are row indices into this range, so it holds still while they live.
  const range = untrack(() => initialRange);
  const rows = rowCount(range);
  const cellIndex = (dayIndex: number, row: number) =>
    cellIndexIn(dayIndex, row, range);

  // Seeded once; the picker owns the selection while it is open.
  let cells = $state.raw<Set<number>>(
    untrack(() => cellsFromWindows(windows, range)),
  );
  let gridMode = $state<TimeGridMode>(untrack(() => initialMode));

  // A rectangle from an anchor cell, so a fast flick cannot skip cells.
  let dragRect = $state.raw<Rect | null>(null);
  let anchor: Cell | null = null;
  let brush: Brush = 'paint';

  let focusCell = $state<Cell>({ dayIndex: 0, row: 0 });
  let showFocus = $state(false);
  // The keyboard's drag: Space or the first Shift+Arrow sets the anchor, and
  // each Shift+Arrow redraws the rectangle to the focus over `keyBase`, the
  // cells as they were before the run, so it can shrink back like a drag.
  let keyAnchor: Cell | null = null;
  let keyBrush: Brush = 'paint';
  let keyBase: ReadonlySet<number> = new Set();

  let bodyEl = $state<HTMLDivElement | null>(null);

  const painted = $derived(
    dragRect ? applyRect(cells, dragRect, brush) : cells,
  );
  const previewWindows = $derived(windowsFromCells(painted, range));
  const summary = $derived(describeWindows(previewWindows, gridMode));

  const hours = Array.from({ length: gridHours(range) }, (_, i) => i);
  // Interior gridlines in row units: odd rows begin on the half hour.
  const halfLines = hours.map(h => h * 2 + 1);
  const hourLines = hours.slice(1).map(h => h * 2);
  const dayLines = GRID_DAYS.slice(1).map((_, i) => i + 1);
  // One day column's share of the grid width, in percent.
  const DAY_PCT = 100 / GRID_DAYS.length;

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
   * Pixel -> cell, measured against the gapless body. Clamping means dragging
   * past an edge extends the selection to that edge.
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
        Math.floor(((clientY - r.top) / r.height) * rows),
        0,
        rows - 1,
      ),
    };
  }

  /** Single write path; runs on commit, never per pointermove. */
  function commit(next: Set<number>): void {
    cells = next;
    onchange(gridMode, windowsFromCells(cells, range));
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || !bodyEl) return;
    e.preventDefault();
    const cell = cellAt(e.clientX, e.clientY);
    keyAnchor = null;
    anchor = cell;
    focusCell = cell;
    // Starting on a painted cell erases, on an empty one paints, which makes a
    // zero-distance drag a click-to-toggle.
    brush = cells.has(cellIndex(cell.dayIndex, cell.row)) ? 'erase' : 'paint';
    dragRect = rectOf(cell, cell);
    try {
      bodyEl.setPointerCapture(e.pointerId);
    } catch {
      // Throws on an unrecognised pointer id; the drag still tracks while the
      // pointer stays over the grid.
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
    const full = Array.from({ length: rows }, (_, r) => cellIndex(dayIndex, r));
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
    onchange(gridMode, windowsFromCells(cells, range));
  }

  function clearAll(): void {
    commit(new Set());
  }

  /**
   * Starts a keyboard run at the focus, the counterpart of pointerdown. Same
   * rule as the pointer: the cell the run starts on decides the brush.
   */
  function startKeyRun(): void {
    keyAnchor = focusCell;
    keyBrush = cells.has(cellIndex(focusCell.dayIndex, focusCell.row))
      ? 'erase'
      : 'paint';
    keyBase = cells;
  }

  function moveFocus(dDay: number, dRow: number, extend: boolean): void {
    if (!extend) keyAnchor = null;
    else if (!keyAnchor) startKeyRun();
    focusCell = {
      dayIndex: clamp(focusCell.dayIndex + dDay, 0, GRID_DAYS.length - 1),
      row: clamp(focusCell.row + dRow, 0, rows - 1),
    };
    if (keyAnchor) {
      commit(applyRect(keyBase, rectOf(keyAnchor, focusCell), keyBrush));
    }
  }

  function onKeyDown(e: KeyboardEvent): void {
    const extend = e.shiftKey;

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
        keyAnchor = null;
        focusCell = { ...focusCell, row: 0 };
        break;
      case 'End':
        keyAnchor = null;
        focusCell = { ...focusCell, row: rows - 1 };
        break;
      case 'PageUp':
        keyAnchor = null;
        focusCell = {
          ...focusCell,
          dayIndex: clamp(focusCell.dayIndex - 1, 0, GRID_DAYS.length - 1),
        };
        break;
      case 'PageDown':
        keyAnchor = null;
        focusCell = {
          ...focusCell,
          dayIndex: clamp(focusCell.dayIndex + 1, 0, GRID_DAYS.length - 1),
        };
        break;
      case ' ':
      case 'Enter':
        // Toggles the cell like a click, and leaves the run open so Shift+Arrow
        // carries on with the same brush rather than undoing the toggle.
        startKeyRun();
        commit(applyRect(keyBase, rectOf(focusCell, focusCell), keyBrush));
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  const spanMin = range.endMin - range.startMin;

  function topPct(startMin: number): string {
    return `${((startMin - range.startMin) / spanMin) * 100}%`;
  }

  function heightPct(startMin: number, endMin: number): string {
    return `${((endMin - startMin) / spanMin) * 100}%`;
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
  </div>

  <div class={styles.grid} style:--grid-hours={hours.length}>
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
        title={`Select ${hourLabel(range, hour)} on every day`}
        onclick={() => toggleHour(hour)}>{hourLabel(range, hour)}</button
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
        keyAnchor = null;
      }}
    >
      <!-- One overlay rather than a background gradient: Firefox drops most 1px
           stops of a stripe that is not a whole pixel tall. Scaled to the body
           with unscaled crisp strokes, every line lands on a pixel. -->
      <svg
        class={styles.lines}
        viewBox="0 0 {GRID_DAYS.length} {rows}"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {#each halfLines as y (y)}
          <line
            data-line="half"
            class={styles.halfLine}
            x1="0"
            x2={GRID_DAYS.length}
            y1={y}
            y2={y}
          />
        {/each}
        {#each hourLines as y (y)}
          <line data-line="hour" x1="0" x2={GRID_DAYS.length} y1={y} y2={y} />
        {/each}
        {#each dayLines as x (x)}
          <line data-line="day" x1={x} x2={x} y1="0" y2={rows} />
        {/each}
      </svg>

      {#each previewWindows as w (`${w.day}-${w.startMin}`)}
        <div
          class="{styles.painted} {gridMode === 'only'
            ? styles.paintedOnly
            : styles.paintedAvoid}"
          style:left="{GRID_DAYS.indexOf(w.day) * DAY_PCT}%"
          style:width="{DAY_PCT}%"
          style:top={topPct(w.startMin)}
          style:height={heightPct(w.startMin, w.endMin)}
        ></div>
      {/each}

      {#if showFocus}
        <div
          class={styles.focusRing}
          style:left="{focusCell.dayIndex * DAY_PCT}%"
          style:width="{DAY_PCT}%"
          style:top={topPct(rowStartMin(focusCell.row, range))}
          style:height={heightPct(0, CELL_MINUTES)}
        ></div>
      {/if}
    </div>
  </div>

  <div class={styles.summary}>
    <span class={styles.summaryText} aria-live="polite">{summary}</span>
    <!-- Always shown (disabled while empty), so the row keeps its height and
         the grid does not shift when the first cell is painted. -->
    <button
      type="button"
      class="filter-clear-btn {styles.summaryClear}"
      disabled={previewWindows.length === 0}
      onclick={clearAll}>Clear</button
    >
  </div>

  <p class={styles.hint}>
    Drag to select. Drag again over a selection to erase it, or click a day or
    hour label to toggle the whole row or column.
  </p>
</div>
