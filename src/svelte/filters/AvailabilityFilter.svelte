<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import TextField from '../ui/TextField.svelte';
  import FilterToggle from './FilterToggle.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { CourseSelectionService } from '../../services/selection/CourseSelectionService';
  import type { AutoScheduleOrchestrator } from '../../services/scheduling/AutoScheduleOrchestrator';
  import type {
    AvailabilityFilterCriteria,
    ConflictCriteria,
  } from '../../types/filters';
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

  const availCriteria = $derived(
    filterService.getCriteria<AvailabilityFilterCriteria>('availability'),
  );
  const availableOnly = $derived(availCriteria?.availableOnly ?? false);
  const minAvailable = $derived(availCriteria?.minAvailable);

  const conflictCriteria = $derived(
    filterService.getCriteria<ConflictCriteria>('periodConflict'),
  );
  const avoidConflicts = $derived(conflictCriteria?.avoidConflicts ?? false);
  const blockedSlots = $derived(conflictCriteria?.blockedSlots ?? []);
  const hideCalendarClashes = $derived(
    conflictCriteria?.avoidCalendarEvents ?? false,
  );
  // Unset means on.
  const keepClearOfEvents = $derived(
    appState.preferences.avoidCalendarEvents !== false,
  );
  const isAuto = $derived(mode === 'auto-schedule');
  // Unset means on: F conflicts with A and B, S with C and D.
  const semesterSpans = $derived(
    conflictCriteria?.semesterSpansQuarters ?? true,
  );

  const calendarEventCount = $derived(
    autoScheduleOrchestrator?.getLocalEventCount() ?? 0,
  );
  // A course-list toggle left on stays visible with no events, so it can be
  // turned off: otherwise it hides sections again the moment an event exists.
  const showCalendarToggle = $derived(
    calendarEventCount > 0 || (!isAuto && hideCalendarClashes),
  );
  const calendarCountText = $derived(
    calendarEventCount === 1 ? '1 event' : `${calendarEventCount} events`,
  );

  function writeAvailability(
    onlyAvail: boolean,
    minAvail: number | undefined,
  ): void {
    if (onlyAvail || minAvail) {
      filterService.addFilter('availability', {
        availableOnly: onlyAvail,
        minAvailable: minAvail || undefined,
      });
    } else {
      filterService.removeFilter('availability');
    }
  }

  function onAvailableOnly(checked: boolean): void {
    writeAvailability(checked, minAvailable);
  }

  function onMinSeats(value: string): void {
    writeAvailability(availableOnly, value ? parseInt(value) : undefined);
  }

  function onAvoidConflicts(checked: boolean): void {
    if (checked) {
      const selectedCourses = courseSelectionService.getSelectedCourses();
      filterService.addFilter('periodConflict', {
        avoidConflicts: true,
        selectedCourses,
        blockedSlots,
        semesterSpansQuarters: semesterSpans,
        avoidCalendarEvents: hideCalendarClashes,
      });
    } else if (blockedSlots.length > 0 || hideCalendarClashes) {
      filterService.addFilter('periodConflict', {
        avoidConflicts: false,
        blockedSlots,
        semesterSpansQuarters: semesterSpans,
        avoidCalendarEvents: hideCalendarClashes,
      });
    } else {
      filterService.removeFilter('periodConflict');
    }
  }

  function onCalendarToggle(checked: boolean): void {
    if (checked) {
      filterService.addFilter('periodConflict', {
        avoidConflicts,
        selectedCourses:
          conflictCriteria?.selectedCourses ??
          courseSelectionService.getSelectedCourses(),
        blockedSlots,
        semesterSpansQuarters: semesterSpans,
        avoidCalendarEvents: true,
      });
    } else if (avoidConflicts || blockedSlots.length > 0) {
      filterService.addFilter('periodConflict', {
        ...conflictCriteria,
        avoidConflicts,
        blockedSlots,
        avoidCalendarEvents: false,
      });
    } else {
      filterService.removeFilter('periodConflict');
    }
  }

  function onSemesterSpans(checked: boolean): void {
    if (!conflictCriteria) return;
    filterService.addFilter('periodConflict', {
      ...conflictCriteria,
      semesterSpansQuarters: checked,
    });
  }
</script>

<FilterSection title="Availability">
  <FilterToggle
    id="avoid-conflicts-filter"
    label="Hide periods that conflict with selected sections"
    checked={avoidConflicts}
    onchange={onAvoidConflicts}
  />

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
        checked={hideCalendarClashes}
        onchange={onCalendarToggle}
      />
    {/if}
  {/if}

  {#if avoidConflicts || hideCalendarClashes}
    <FilterToggle
      id="semester-spans-filter"
      label="Semester courses (F, S) conflict with their quarters (A and B, C and D)"
      checked={semesterSpans}
      onchange={onSemesterSpans}
    />
  {/if}

  <FilterToggle
    id="available-only-filter"
    label="Show only sections with available seats"
    checked={availableOnly}
    onchange={onAvailableOnly}
  />

  <div class="filter-range-container filter-subsection">
    <TextField
      id="min-seats-filter"
      type="number"
      inputmode="numeric"
      label="Minimum Available Seats"
      panel
      min={0}
      max={999}
      placeholder="Any"
      value={String(minAvailable ?? '')}
      oninput={e => onMinSeats((e.currentTarget as HTMLInputElement).value)}
    />
  </div>
</FilterSection>
