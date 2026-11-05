<script lang="ts">
  import { appState } from '../core/state/appState.svelte';
  import { isAcademicYearChanged } from '../services/filtering/advancedFilterCount';
  import type { FilterService } from '../services/filtering/FilterService';
  import type { SearchTextFilterCriteria } from '../types/filters';

  let { filterService }: { filterService: FilterService } = $props();

  const year = $derived(appState.activeSchedule?.year);

  // What is narrowing an empty list, one entry per thing the student can undo.
  const reasons = $derived.by(() => {
    const active = filterService.getActiveFilters();
    const out: string[] = [];
    for (const f of active) {
      if (f.id === 'searchText') {
        out.push(`search "${(f.criteria as SearchTextFilterCriteria).query}"`);
      } else if (f.id === 'bookmark') {
        out.push(
          appState.bookmarkedIds.size === 0
            ? 'bookmarked courses only (you have no bookmarks yet)'
            : 'bookmarked courses only',
        );
      } else if (f.id === 'academicYear') {
        if (isAcademicYearChanged(active, year))
          out.push(`academic year ${f.displayValue}`);
      } else {
        out.push(
          f.displayValue.includes(':')
            ? f.displayValue
            : `${f.name}: ${f.displayValue}`,
        );
      }
    }
    return out;
  });

  const hasSearch = $derived(filterService.hasFilter('searchText'));
</script>

<div class="empty-state" data-empty-results>
  <p>No courses match.</p>
  {#if reasons.length > 0}
    <p class="empty-reasons">Narrowed by {reasons.join('; ')}.</p>
    <div class="empty-actions">
      {#if hasSearch && reasons.length > 1}
        <button
          type="button"
          class="btn btn-secondary"
          onclick={() => filterService.removeFilter('searchText')}
          >Clear search</button
        >
      {/if}
      <button
        type="button"
        class="btn btn-primary"
        data-clear-filters
        onclick={() => filterService.resetFilters(year)}
        >Clear {hasSearch && reasons.length === 1
          ? 'search'
          : 'filters'}</button
      >
    </div>
  {/if}
</div>

<style>
  .empty-reasons {
    margin: 0.25rem 0 1rem;
  }

  .empty-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }
</style>
