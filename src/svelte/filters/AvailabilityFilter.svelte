<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import FilterToggle from './FilterToggle.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { CourseSelectionService } from '../../services/selection/CourseSelectionService';
  import type { AutoScheduleOrchestrator } from '../../services/scheduling/AutoScheduleOrchestrator';
  import type { AvailabilityFilterCriteria, ConflictCriteria } from '../../types/filters';
  import type { WeeklyTimeSlot } from '../../types/schedule';

  let {
    filterService,
    courseSelectionService,
    autoScheduleOrchestrator,
  }: {
    filterService: FilterService;
    courseSelectionService: CourseSelectionService;
    autoScheduleOrchestrator: AutoScheduleOrchestrator;
  } = $props();

  const isCalendarSlot = (slot: WeeklyTimeSlot): boolean =>
    !!(slot.id?.includes('calendar-') || slot.id?.match(/^[0-9a-f-]{36}/));

  const availCriteria = $derived(filterService.getCriteria<AvailabilityFilterCriteria>('availability'));
  const availableOnly = $derived(availCriteria?.availableOnly ?? false);
  const minAvailable = $derived(availCriteria?.minAvailable);

  const conflictCriteria = $derived(filterService.getCriteria<ConflictCriteria>('periodConflict'));
  const avoidConflicts = $derived(conflictCriteria?.avoidConflicts ?? false);
  const blockedSlots = $derived(conflictCriteria?.blockedSlots ?? []);
  const hasCalendarEvents = $derived(blockedSlots.some(isCalendarSlot));

  const calendarEventCount = $derived(autoScheduleOrchestrator?.getLocalEventCount() ?? 0);
  const showCalendarToggle = $derived(calendarEventCount > 0);
  const calendarCountText = $derived(
    calendarEventCount === 1 ? '1 event' : `${calendarEventCount} events`
  );

  function writeAvailability(onlyAvail: boolean, minAvail: number | undefined): void {
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
      const selectedCourses = courseSelectionService.getSelectedCourses() ?? [];
      filterService.addFilter('periodConflict', {
        avoidConflicts: true,
        selectedCourses,
        blockedSlots, // preserve existing (e.g. calendar) slots
      });
    } else if (blockedSlots.length > 0) {
      filterService.addFilter('periodConflict', { avoidConflicts: false, blockedSlots });
    } else {
      filterService.removeFilter('periodConflict');
    }
  }

  function onCalendarToggle(checked: boolean): void {
    if (!autoScheduleOrchestrator) return;
    const avoid = avoidConflicts;
    const selectedCourses =
      conflictCriteria?.selectedCourses ?? courseSelectionService.getSelectedCourses() ?? [];
    const nonCalendarSlots = blockedSlots.filter((s) => !isCalendarSlot(s));

    if (checked) {
      const calendarSlots = autoScheduleOrchestrator.getAllCalendarBlockedTimes();
      filterService.addFilter('periodConflict', {
        avoidConflicts: avoid,
        selectedCourses,
        blockedSlots: [...nonCalendarSlots, ...calendarSlots],
      });
    } else if (nonCalendarSlots.length > 0 || avoid) {
      filterService.addFilter('periodConflict', {
        avoidConflicts: avoid,
        selectedCourses,
        blockedSlots: nonCalendarSlots,
      });
    } else {
      filterService.removeFilter('periodConflict');
    }
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
    <FilterToggle
      label={`Hide sections that conflict with calendar events (${calendarCountText})`}
      checked={hasCalendarEvents}
      onchange={onCalendarToggle}
    />
  {/if}

  <FilterToggle
    id="available-only-filter"
    label="Show only sections with available seats"
    checked={availableOnly}
    onchange={onAvailableOnly}
  />

  <div class="filter-range-container filter-subsection">
    <div class="filter-range-input">
      <label for="min-seats-filter">Minimum Available Seats</label>
      <input
        type="number"
        id="min-seats-filter"
        min="0"
        max="999"
        placeholder="Any"
        value={minAvailable ?? ''}
        oninput={(e) => onMinSeats(e.currentTarget.value)}
      />
    </div>
  </div>
</FilterSection>
