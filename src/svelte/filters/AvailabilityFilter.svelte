<script lang="ts">
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

  const availCriteria = $derived(
    filterService.getActiveFilters().find((f) => f.id === 'availability')?.criteria as
      | AvailabilityFilterCriteria
      | undefined
  );
  const availableOnly = $derived(availCriteria?.availableOnly ?? false);
  const minAvailable = $derived(availCriteria?.minAvailable);

  const conflictCriteria = $derived(
    filterService.getActiveFilters().find((f) => f.id === 'periodConflict')?.criteria as
      | ConflictCriteria
      | undefined
  );
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

<div class="filter-section">
  <div class="filter-section-header">
    <h4 class="filter-section-title">Availability</h4>
  </div>
  <div class="filter-section-content">
    <label class="filter-toggle-label">
      <input
        type="checkbox"
        class="filter-toggle"
        checked={avoidConflicts}
        onchange={(e) => onAvoidConflicts(e.currentTarget.checked)}
      />
      <span class="filter-toggle-slider"></span>
      <span class="filter-toggle-text">Hide periods that conflict with selected sections</span>
    </label>

    {#if showCalendarToggle}
      <label class="filter-toggle-label">
        <input
          type="checkbox"
          class="filter-toggle"
          checked={hasCalendarEvents}
          onchange={(e) => onCalendarToggle(e.currentTarget.checked)}
        />
        <span class="filter-toggle-slider"></span>
        <span class="filter-toggle-text"
          >Hide sections that conflict with calendar events ({calendarCountText})</span
        >
      </label>
    {/if}

    <label class="filter-toggle-label">
      <input
        type="checkbox"
        class="filter-toggle"
        checked={availableOnly}
        onchange={(e) => onAvailableOnly(e.currentTarget.checked)}
      />
      <span class="filter-toggle-slider"></span>
      <span class="filter-toggle-text">Show only sections with available seats</span>
    </label>

    <div class="filter-range-container" style="margin-top: 0.75rem;">
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
  </div>
</div>
