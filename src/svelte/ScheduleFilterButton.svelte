<script lang="ts">
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import type { FilterService } from '../services/filtering/FilterService';

  let {
    filterService,
    onFilter,
  }: {
    filterService: FilterService;
    onFilter: () => void;
  } = $props();

  // Schedule-page counterpart to the planner #filter-btn in FilterButtons.svelte.
  // hasNonDefaultFilters / getFilterCount read the SvelteMap-backed FilterState
  // (and appState.activeSchedule is a rune), so these $derived recompute on their
  // own - no dependency trick needed.
  const year = $derived(appState.activeSchedule?.year);
  const hasNonDefault = $derived(filterService.hasNonDefaultFilters(year));
  const filterCount = $derived(filterService.getFilterCount());
</script>

<button
  id="schedule-filter-btn"
  class="btn btn-secondary filter-btn"
  class:active={hasNonDefault}
  title={hasNonDefault
    ? `${filterCount} filter${filterCount === 1 ? '' : 's'} active - Click to modify`
    : 'Filter selected courses'}
  aria-label="Filter selected courses"
  onclick={onFilter}
  >{@html getInlineSVG('FILTER_FILLED', 'filter-icon')}</button
>
