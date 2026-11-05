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
  import { appState } from '../../core/state/appState.svelte';
  import { autoScheduleService } from '../../services/scheduling/autoScheduleService';

  let {
    filterService,
    courseSelectionService,
    autoScheduleOrchestrator,
    mode,
  }: {
    filterService: FilterService;
    courseSelectionService: CourseSelectionService;
    autoScheduleOrchestrator: AutoScheduleOrchestrator;
    mode: 'filter' | 'auto-schedule';
  } = $props();

  const avail = $derived(readAvailability(filterService));
  const isAuto = $derived(mode === 'auto-schedule');
  // Auto-Schedule's own setting; unset means on.
  const keepClearOfEvents = $derived(
    appState.preferences.avoidCalendarEvents !== false,
  );

  const calendarEventCount = $derived(
    autoScheduleOrchestrator?.getLocalEventCount() ?? 0,
  );
  // A course-list toggle left on stays visible with no events, so it can be
  // turned off: otherwise it hides sections again the moment an event exists.
  const showCalendarToggle = $derived(
    calendarEventCount > 0 || (!isAuto && avail.hasCalendarEvents),
  );
  const calendarCountText = $derived(
    calendarEventCount === 1 ? '1 event' : `${calendarEventCount} events`,
  );

  // Whole numbers from 0 up. A number input reports "" for text it can't read
  // ("1e3" is read as 1000, "-" as nothing), so anything else is no minimum.
  let seatsError = $state('');
  function onMinSeats(value: string): void {
    const seats = Number(value);
    const typed = value.trim() !== '';
    const valid = typed && Number.isInteger(seats) && seats >= 0;
    seatsError = typed && !valid ? 'Enter a whole number, 0 or more' : '';
    writeAvailability(
      filterService,
      avail.availableOnly,
      valid && seats > 0 ? seats : undefined,
    );
  }
</script>

<FilterSection title="Availability details">
  {#if showCalendarToggle}
    {#if isAuto}
      <FilterToggle
        id="keep-clear-of-events"
        label={`Keep classes clear of my calendar events (${calendarCountText})`}
        checked={keepClearOfEvents}
        onchange={checked =>
          autoScheduleService.setAvoidCalendarEvents(checked)}
      />
    {:else}
      <FilterToggle
        id="hide-calendar-conflicts-filter"
        label={`Hide sections that conflict with calendar events (${calendarCountText})`}
        checked={avail.hasCalendarEvents}
        onchange={checked =>
          setCalendarConflicts(filterService, courseSelectionService, checked)}
      />
    {/if}
  {/if}

  {#if avail.avoidConflicts || avail.hasCalendarEvents}
    <FilterToggle
      id="semester-spans-filter"
      label="Semester courses (F, S) conflict with their quarters (A and B, C and D)"
      checked={avail.semesterSpans}
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
      error={seatsError || undefined}
      value={String(avail.minAvailable ?? '')}
      oninput={e => onMinSeats((e.currentTarget as HTMLInputElement).value)}
    />
  </div>
</FilterSection>
