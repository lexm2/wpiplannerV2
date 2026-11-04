<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import TextField from '../ui/TextField.svelte';
  import FilterToggle from './FilterToggle.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { CourseSelectionService } from '../../services/selection/CourseSelectionService';
  import type { AutoScheduleOrchestrator } from '../../services/scheduling/AutoScheduleOrchestrator';
  import {
    readAvailability,
    setCalendarConflicts,
    setSemesterSpans,
    writeAvailability,
  } from '../../services/filtering/availabilityCriteria';

  let {
    filterService,
    courseSelectionService,
    autoScheduleOrchestrator,
  }: {
    filterService: FilterService;
    courseSelectionService: CourseSelectionService;
    autoScheduleOrchestrator: AutoScheduleOrchestrator;
  } = $props();

  const state = $derived(readAvailability(filterService));

  const calendarEventCount = $derived(
    autoScheduleOrchestrator?.getLocalEventCount() ?? 0,
  );
  const calendarCountText = $derived(
    calendarEventCount === 1 ? '1 event' : `${calendarEventCount} events`,
  );

  function onMinSeats(value: string): void {
    writeAvailability(
      filterService,
      state.availableOnly,
      value ? parseInt(value) : undefined,
    );
  }
</script>

<FilterSection title="Availability details">
  {#if calendarEventCount > 0}
    <FilterToggle
      label={`Hide sections that conflict with calendar events (${calendarCountText})`}
      checked={state.hasCalendarEvents}
      onchange={checked =>
        setCalendarConflicts(
          filterService,
          courseSelectionService,
          autoScheduleOrchestrator,
          checked,
        )}
    />
  {/if}

  {#if state.avoidConflicts || state.hasCalendarEvents}
    <FilterToggle
      id="semester-spans-filter"
      label="Semester courses (F, S) conflict with their quarters (A and B, C and D)"
      checked={state.semesterSpans}
      onchange={checked => setSemesterSpans(filterService, checked)}
    />
  {/if}

  <div class="filter-range-container">
    <TextField
      id="min-seats-filter"
      type="number"
      inputmode="numeric"
      label="Minimum Available Seats"
      panel
      min={0}
      max={999}
      placeholder="Any"
      value={String(state.minAvailable ?? '')}
      oninput={e => onMinSeats((e.currentTarget as HTMLInputElement).value)}
    />
  </div>
</FilterSection>
