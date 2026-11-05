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

  // getFilterCount / hasFilter read the SvelteMap-backed FilterState (and
  // appState.activeSchedule is a rune), so these $derived recompute on their
  // own - no dependency trick needed.
  const filterCount = $derived(
    filterService.getFilterCount(appState.activeSchedule?.year),
  );
  const hasNonDefault = $derived(filterCount > 0);
  const bookmarkOn = $derived(filterService.hasFilter('bookmark'));

  function toggleBookmark(): void {
    if (filterService.hasFilter('bookmark')) {
      filterService.removeFilter('bookmark');
    } else {
      filterService.addFilter('bookmark', { showBookmarkedOnly: true });
    }
  }
</script>

<div class="filter-buttons">
  <button
    id="filter-btn"
    class="filter-btn"
    class:active={hasNonDefault}
    title={hasNonDefault
      ? `${filterCount} filter${filterCount === 1 ? '' : 's'} active - Click to modify`
      : 'Filter courses'}
    aria-label="Filter courses"
    onclick={onFilter}
    >{@html getInlineSVG('FILTER_FILLED', 'filter-icon')}</button
  >
  <button
    id="bookmark-filter-btn"
    class="filter-btn"
    class:active={bookmarkOn}
    title={bookmarkOn ? 'Show all courses' : 'Show bookmarked only'}
    aria-label="Show bookmarked courses only"
    aria-pressed={bookmarkOn}
    onclick={toggleBookmark}
    >{@html getInlineSVG(
      bookmarkOn ? 'BOOKMARK_FILLED' : 'BOOKMARK',
      'bookmark-icon',
    )}</button
  >
</div>
