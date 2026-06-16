<script lang="ts">
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import type { FilterService } from '../services/filtering/FilterService';

  let { filterService, onFilter }: {
    filterService: FilterService;
    onFilter: () => void;
  } = $props();

  // The schedule-page filter button. Mirrors the planner #filter-btn in
  // FilterButtons.svelte: the active filters live in a SvelteMap (read via
  // getActiveFilters()) and appState.activeSchedule is a rune, so reading both
  // inside these $derived makes the active class + title recompute on their own.
  // Replaces the two imperative updateScheduleFilterButtonState copies
  // (MainController + ScheduleController), the filter `watch`/applyFiltersAndRefresh
  // plumbing that drove them, and the setTimeout(100) initializer.
  const year = $derived(appState.activeSchedule?.year);
  const hasNonDefault = $derived((filterService.getActiveFilters(), filterService.hasNonDefaultFilters(year)));
  const filterCount = $derived((filterService.getActiveFilters(), filterService.getFilterCount()));
</script>

<button
  id="schedule-filter-btn"
  class="btn btn-secondary filter-btn"
  class:active={hasNonDefault}
  title={hasNonDefault ? `${filterCount} filter${filterCount === 1 ? '' : 's'} active - Click to modify` : 'Filter selected courses'}
  aria-label="Filter selected courses"
  onclick={onFilter}
>{@html getInlineSVG('FILTER_FILLED', 'filter-icon')}</button>
