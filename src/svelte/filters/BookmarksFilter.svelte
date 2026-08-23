<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import FilterToggle from './FilterToggle.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { BookmarkFilterCriteria } from '../../types/filters';

  let { filterService }: { filterService: FilterService } = $props();

  const showBookmarkedOnly = $derived(
    filterService.getCriteria<BookmarkFilterCriteria>('bookmark')
      ?.showBookmarkedOnly ?? false,
  );

  function toggle(checked: boolean): void {
    if (checked)
      filterService.addFilter('bookmark', { showBookmarkedOnly: true });
    else filterService.removeFilter('bookmark');
  }
</script>

<FilterSection title="Bookmarks">
  <FilterToggle
    label="Show only bookmarked courses"
    checked={showBookmarkedOnly}
    onchange={toggle}
  />
</FilterSection>
