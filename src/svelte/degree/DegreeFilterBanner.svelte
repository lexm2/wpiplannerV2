<script lang="ts">
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { DegreeBucketFilterCriteria } from '../../types/filters';
  import { setPage } from '../../services/ui/uiState.svelte';
  import { getInlineSVG } from '../../utils/iconPaths';

  let { filterService }: { filterService: FilterService } = $props();

  /**
   * The degree filter has no FilterPanel section - the Degree page sets it - so
   * without this the course list would be narrowed by something nothing on the
   * planner names. Says what it is filtering for, and clears it.
   */
  const criteria = $derived(
    filterService.getCriteria<DegreeBucketFilterCriteria>('degreeBucket'),
  );
</script>

{#if criteria}
  <div class="degree-filter-banner" role="status">
    <span class="degree-filter-banner-text">
      Courses that count toward
      <strong>{criteria.label ?? 'a degree requirement'}</strong>, minus ones
      already on your record or schedule
    </span>
    <button
      type="button"
      class="btn btn-secondary degree-filter-banner-back"
      onclick={() => setPage('degree')}>Back to Degree</button
    >
    <button
      type="button"
      class="filter-btn degree-filter-banner-clear"
      id="degree-filter-clear"
      title="Stop filtering by this requirement"
      aria-label="Clear the degree requirement filter"
      onclick={() => filterService.removeFilter('degreeBucket')}
      >{@html getInlineSVG('X', 'x-icon')}</button
    >
  </div>
{/if}
