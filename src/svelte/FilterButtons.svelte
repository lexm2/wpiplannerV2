<script lang="ts">
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import type { FilterService } from '../services/filtering/FilterService';

  let { filterService, onFilter }: {
    filterService: FilterService;
    onFilter: () => void;
  } = $props();

  // The active filters live in a SvelteMap (read via getActiveFilters()), and
  // `appState.activeSchedule` is a rune — so reading them inside these $derived
  // makes the button state recompute on its own. This replaces MainController's
  // updateFilterButtonState/updateBookmarkFilterButtonState/
  // updateClearFiltersButtonState imperative DOM updates and the setTimeout(100)
  // initializer that primed them.
  const year = $derived(appState.activeSchedule?.year);
  const hasNonDefault = $derived((filterService.getActiveFilters(), filterService.hasNonDefaultFilters(year)));
  const filterCount = $derived((filterService.getActiveFilters(), filterService.getFilterCount()));
  const bookmarkOn = $derived((filterService.getActiveFilters(), filterService.hasFilter('bookmark')));

  // Mirrors the old #bookmark-filter-btn click handler.
  function toggleBookmark(): void {
    if (filterService.hasFilter('bookmark')) {
      filterService.removeFilter('bookmark');
    } else {
      filterService.addFilter('bookmark', { showBookmarkedOnly: true });
    }
  }

  // Mirrors the old #clear-filters-btn click handler. The filter change flows
  // through the SvelteMap, so MainController's filter `watch` refreshes the
  // course list — no manual refresh here.
  function clearFilters(): void {
    filterService.resetFilters(year);
  }
</script>

<button
  id="clear-filters-btn"
  class="filter-btn"
  disabled={!hasNonDefault}
  style:display={hasNonDefault ? '' : 'none'}
  title="Clear all filters"
  aria-label="Clear all filters"
  onclick={clearFilters}
>{@html getInlineSVG('ERASER', 'eraser-icon')}</button>
<div class="filter-buttons">
  <button
    id="filter-btn"
    class="filter-btn"
    class:active={hasNonDefault}
    title={hasNonDefault ? `${filterCount} filter${filterCount === 1 ? '' : 's'} active - Click to modify` : 'Filter courses'}
    aria-label="Filter courses"
    onclick={onFilter}
  >{@html getInlineSVG('FILTER_FILLED', 'filter-icon')}</button>
  <button
    id="bookmark-filter-btn"
    class="filter-btn"
    class:active={bookmarkOn}
    title={bookmarkOn ? 'Show all courses' : 'Show bookmarked only'}
    aria-label="Toggle bookmark filter"
    onclick={toggleBookmark}
  >{@html getInlineSVG(bookmarkOn ? 'BOOKMARK_FILLED' : 'BOOKMARK', 'bookmark-icon')}</button>
</div>
