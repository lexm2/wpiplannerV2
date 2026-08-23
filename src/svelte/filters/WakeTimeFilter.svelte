<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import TextField from '../ui/TextField.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { WakeUpTimeFilterCriteria } from '../../types/filters';

  let { filterService }: { filterService: FilterService } = $props();

  const wakeUpTime = $derived(
    filterService.getCriteria<WakeUpTimeFilterCriteria>('wakeUpTime')?.wakeUpTime ?? null
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

<FilterSection title="Wake-Up Time">
  <TextField
    id="wake-up-time-input"
    type="time"
    label="Earliest class start time"
    panel
    value={timeValue}
    onchange={(e) => onChange((e.currentTarget as HTMLInputElement).value)}
  />
  <p class="wake-up-time-hint">Excludes sections that start before this time</p>
  {#if timeValue}
    <button class="filter-clear-btn" onclick={clear}>Clear</button>
  {/if}
</FilterSection>
