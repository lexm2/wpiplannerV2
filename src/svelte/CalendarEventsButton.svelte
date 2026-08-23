<script lang="ts">
  import { getInlineSVG } from '../utils/iconPaths';

  let { onClick }: { onClick: () => void } = $props();

  // Always shown (users can add local calendar events even with no courses
  // selected). Replaces ScheduleController.buildCalendarEventsButtonHTML +
  // renderCalendarEventsHeader.
  function handleClick(e: MouseEvent): void {
    e.stopPropagation();
    onClick();
  }
</script>

<button
  class="calendar-events-btn"
  id="calendar-events-btn"
  onclick={handleClick}
>
  <span class="calendar-events-btn-icon"
    >{@html getInlineSVG('CALENDAR_DOWN', 'calendar-btn-icon')}</span
  >
  <span class="calendar-events-btn-name">Calendar Events</span>
</button>
