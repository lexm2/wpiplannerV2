<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import FilterToggle from './FilterToggle.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { CourseSelectionService } from '../../services/selection/CourseSelectionService';
  import {
    readAvailability,
    setAvoidConflicts,
    writeAvailability,
  } from '../../services/filtering/availabilityCriteria';

  let {
    filterService,
    courseSelectionService,
  }: {
    filterService: FilterService;
    courseSelectionService: CourseSelectionService;
  } = $props();

  const state = $derived(readAvailability(filterService));
</script>

<FilterSection title="Availability">
  <FilterToggle
    id="avoid-conflicts-filter"
    label="Hide class times that conflict with selected sections"
    checked={state.avoidConflicts}
    onchange={checked =>
      setAvoidConflicts(filterService, courseSelectionService, checked)}
  />

  <FilterToggle
    id="available-only-filter"
    label="Show only sections with available seats"
    checked={state.availableOnly}
    onchange={checked =>
      writeAvailability(filterService, checked, state.minAvailable)}
  />
</FilterSection>
