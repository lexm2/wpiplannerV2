<script lang="ts">
  import { getInlineSVG } from '../../utils/iconPaths';
  import { TimeUtils } from '../../utils/timeUtils';
  import { scheduleSidebarState } from '../scheduleSidebarState.svelte';
  import { WEEKDAYS, type GridBlock } from './scheduleGeometry';

  let {
    term,
    blocks,
    hasConflict,
    focused,
    onFocus,
    onOpenSectionInfo,
    onOpenDeleteEvent,
  }: {
    term: string;
    blocks: GridBlock[];
    hasConflict: boolean;
    focused: boolean;
    onFocus: () => void;
    onOpenSectionInfo: (courseId: string, sectionNumber: string) => void;
    onOpenDeleteEvent: (eventId: string) => void;
  } = $props();

  // Static scaffold: term label + 5 day headers + 60 background cells (gridlines
  // + hover). It never changes; only the block overlay re-renders.
  const timeSlots = Array.from(
    { length: TimeUtils.TOTAL_TIME_SLOTS },
    (_, i) => i,
  );
  function timeLabel(slot: number): string {
    return TimeUtils.formatTime({
      hours: slot + TimeUtils.START_HOUR,
      minutes: 0,
      displayTime: '',
    });
  }

  function sectionClick(e: MouseEvent, b: GridBlock): void {
    e.stopPropagation(); // don't bubble to the term-graph focus handler
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

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="term-graph"
  data-term={term}
  class:focused-term={focused}
  onclick={onFocus}
>
  {#if hasConflict}
    <div
      class="term-conflict-warning"
      title="This term has overlapping courses"
    >
      {@html getInlineSVG('ALERT_CIRCLE', 'conflict-warning-icon')}
    </div>
  {/if}
  <div class="schedule-grid">
    <div class="time-label term-letter-label">{term}</div>
    {#each WEEKDAYS as day (day)}
      <div class="day-header">{TimeUtils.getDayAbbr(day)}</div>
    {/each}
    {#each timeSlots as slot (slot)}
      <div class="time-label">{timeLabel(slot)}</div>
      {#each WEEKDAYS as day (day)}
        <div class="schedule-cell" data-day={day} data-slot={slot}></div>
      {/each}
    {/each}
    <div class="block-layer">
      {#each blocks as b (b.key)}
        {#if b.kind === 'section'}
          <div
            class="section-block"
            data-course-id={b.courseId}
            data-section-number={b.sectionNumber}
            role="button"
            tabindex="0"
            style:top={b.top}
            style:height={b.height}
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
            style:top={b.top}
            style:height={b.height}
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
            style:top={b.top}
            style:height={b.height}
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
            style:top={b.top}
            style:height={b.height}
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
