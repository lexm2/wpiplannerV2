<script lang="ts">
  import { getInlineSVG } from '../../utils/iconPaths';
  import { TimeUtils } from '../../utils/timeUtils';
  import { gridHours, hourLabel, type GridRange } from '../../utils/gridRange';
  import { scheduleSidebarState } from '../scheduleSidebarState.svelte';
  import { WEEKDAYS, verticalStyle, type GridBlock } from './scheduleGeometry';

  let {
    term,
    blocks,
    hasConflict,
    range,
    focused,
    hidden,
    onToggleFocus,
    onOpenSectionInfo,
    onOpenDeleteEvent,
  }: {
    term: string;
    blocks: GridBlock[];
    hasConflict: boolean;
    range: GridRange;
    focused: boolean;
    hidden: boolean;
    onToggleFocus: () => void;
    onOpenSectionInfo: (courseId: string, sectionNumber: string) => void;
    onOpenDeleteEvent: (eventId: string) => void;
  } = $props();

  // Scaffold: term label + 5 day headers + one row of background cells
  // (gridlines + hover) per hour. It changes only when the range does; the
  // block overlay re-renders on its own.
  const timeSlots = $derived(
    Array.from({ length: gridHours(range) }, (_, i) => i),
  );

  function sectionClick(e: MouseEvent, b: GridBlock): void {
    e.stopPropagation(); // don't bubble to the term-graph focus toggle
    if (b.courseId && b.sectionNumber)
      onOpenSectionInfo(b.courseId, b.sectionNumber);
  }
  function sectionKey(e: KeyboardEvent, b: GridBlock): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (b.courseId && b.sectionNumber)
        onOpenSectionInfo(b.courseId, b.sectionNumber);
    }
  }
  function eventClick(e: MouseEvent, b: GridBlock): void {
    e.stopPropagation();
    if (b.eventId) onOpenDeleteEvent(b.eventId);
  }
  function eventKey(e: KeyboardEvent, b: GridBlock): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (b.eventId) onOpenDeleteEvent(b.eventId);
    }
  }
</script>

<!-- A hidden card is only transparent, not display:none, so the zoom has
     something to fade; `inert` is what keeps it out of the tab order. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="term-graph"
  data-term={term}
  class:focused-term={focused}
  inert={hidden}
  onclick={onToggleFocus}
>
  {#if hasConflict}
    <div
      class="term-conflict-warning"
      title="This term has overlapping courses"
    >
      {@html getInlineSVG('ALERT_CIRCLE', 'conflict-warning-icon')}
    </div>
  {/if}
  <div class="schedule-grid" style:--grid-hours={timeSlots.length}>
    <!-- The keyboard way into the term zoom the card's click gives a mouse. -->
    <button
      type="button"
      class="time-label term-letter-label"
      aria-pressed={focused}
      aria-label={`Zoom to ${term} term`}
      onclick={e => {
        e.stopPropagation(); // the card's own click would toggle it back
        onToggleFocus();
      }}>{term}</button
    >
    {#each WEEKDAYS as day (day)}
      <div class="day-header">{TimeUtils.getDayAbbr(day)}</div>
    {/each}
    {#each timeSlots as slot (slot)}
      <div class="time-label">{hourLabel(range, slot)}</div>
      {#each WEEKDAYS as day (day)}
        <div class="schedule-cell" data-day={day} data-slot={slot}></div>
      {/each}
    {/each}
    <div class="block-layer">
      {#each blocks as b (b.key)}
        {@const v = verticalStyle(range, b)}
        {#if b.kind === 'section'}
          <div
            class="section-block"
            data-course-id={b.courseId}
            data-section-number={b.sectionNumber}
            role="button"
            tabindex="0"
            style:top={v.top}
            style:height={v.height}
            style:left={b.left}
            style:width={b.width}
            style:background-color={b.color}
            onmouseenter={() =>
              (scheduleSidebarState.hoveredCourseId = b.courseId ?? null)}
            onmouseleave={() => (scheduleSidebarState.hoveredCourseId = null)}
            onclick={e => sectionClick(e, b)}
            onkeydown={e => sectionKey(e, b)}
          >
            {b.label}
          </div>
        {:else if b.kind === 'preview'}
          <div
            class="section-preview"
            style:top={v.top}
            style:height={v.height}
            style:left={b.left}
            style:width={b.width}
            style:border-color={b.color}
            style:--preview-color={b.color}
          >
            {b.label}
          </div>
        {:else if b.kind === 'conflict'}
          <div
            class="conflict-overlay"
            title={`Conflict: ${b.conflictInfo}`}
            data-conflicts-with={b.conflictInfo}
            style:top={v.top}
            style:height={v.height}
            style:left={b.left}
            style:width={b.width}
          ></div>
        {:else}
          <div
            class="external-event-block"
            data-event-id={b.eventId}
            title={b.title}
            role="button"
            tabindex="0"
            style:top={v.top}
            style:height={v.height}
            style:left={b.left}
            style:width={b.width}
            onclick={e => eventClick(e, b)}
            onkeydown={e => eventKey(e, b)}
          >
            {b.label}
          </div>
        {/if}
      {/each}
    </div>
  </div>
</div>

<style>
  /* Look like the plain label it replaced: drop the UA button chrome, keeping
     the global .time-label/.term-letter-label rules (border-right included). */
  button.term-letter-label {
    margin: 0;
    border: 0;
    border-right: 2px solid var(--color-border);
    line-height: inherit;
    cursor: pointer;
    /* The card clips overflow, so ring inside the cell. */
    outline-offset: -2px;
  }
</style>
