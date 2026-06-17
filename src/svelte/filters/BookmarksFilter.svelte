<script lang="ts">
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { BookmarkFilterCriteria } from '../../types/filters';

  let { filterService }: { filterService: FilterService } = $props();

  const showBookmarkedOnly = $derived.by<boolean>(() => {
    const f = filterService.getActiveFilters().find((f) => f.id === 'bookmark');
    return (f?.criteria as BookmarkFilterCriteria | undefined)?.showBookmarkedOnly ?? false;
  });

  function toggle(checked: boolean): void {
    if (checked) filterService.addFilter('bookmark', { showBookmarkedOnly: true });
    else filterService.removeFilter('bookmark');
  }
</script>

<div class="filter-section">
  <div class="filter-section-header">
    <h4 class="filter-section-title">Bookmarks</h4>
  </div>
  <div class="filter-section-content">
    <label class="filter-toggle-label">
      <input
        type="checkbox"
        class="filter-toggle"
        checked={showBookmarkedOnly}
        onchange={(e) => toggle(e.currentTarget.checked)}
      />
      <span class="filter-toggle-slider"></span>
      <span class="filter-toggle-text">Show only bookmarked courses</span>
    </label>
  </div>
</div>
