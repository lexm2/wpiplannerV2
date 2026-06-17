<script lang="ts">
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { WakeUpTimeFilterCriteria } from '../../types/filters';

  let { filterService }: { filterService: FilterService } = $props();

  const wakeUpTime = $derived(
    (
      filterService.getActiveFilters().find((f) => f.id === 'wakeUpTime')?.criteria as
        | WakeUpTimeFilterCriteria
        | undefined
    )?.wakeUpTime ?? null
  );

  const timeValue = $derived(
    wakeUpTime
      ? `${String(wakeUpTime.hours).padStart(2, '0')}:${String(wakeUpTime.minutes).padStart(2, '0')}`
      : ''
  );

  function onChange(value: string): void {
    if (value && value.trim()) {
      const [hours, minutes] = value.split(':').map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) {
        filterService.addFilter('wakeUpTime', { wakeUpTime: { hours, minutes } });
      }
    } else {
      filterService.removeFilter('wakeUpTime');
    }
  }

  function clear(): void {
    filterService.removeFilter('wakeUpTime');
  }
</script>

<div class="filter-section">
  <div class="filter-section-header">
    <h4 class="filter-section-title">Wake-Up Time</h4>
  </div>
  <div class="filter-section-content">
    <label class="wake-up-time-label" for="wake-up-time-input">Earliest class start time</label>
    <input
      type="time"
      id="wake-up-time-input"
      class="wake-up-time-input"
      value={timeValue}
      onchange={(e) => onChange(e.currentTarget.value)}
    />
    <p class="wake-up-time-hint">Excludes sections that start before this time</p>
    {#if timeValue}
      <button class="filter-clear-btn" onclick={clear}>Clear</button>
    {/if}
  </div>
</div>
