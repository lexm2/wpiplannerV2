<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import { openModal } from '../../services/ui/uiState.svelte';
  import { describeWindows } from '../../utils/timeWindows';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type {
    AsyncFilterCriteria,
    TimesFilterCriteria,
  } from '../../types/filters';
  import styles from '../../styles/components/time-grid.module.css';

  let { filterService }: { filterService: FilterService } = $props();

  const criteria = $derived(
    filterService.getCriteria<TimesFilterCriteria>('times'),
  );

  // Set by the toggle inside the same modal, so it belongs in the same summary.
  const hideAsync = $derived(
    filterService.getCriteria<AsyncFilterCriteria>('async')?.include === false,
  );

  const summary = $derived(
    [
      criteria?.windows?.length
        ? describeWindows(criteria.windows, criteria.mode)
        : 'Any time',
      hideAsync ? 'no async' : null,
    ]
      .filter(Boolean)
      .join(' • '),
  );

  function clear(): void {
    filterService.removeFilter('times');
    filterService.removeFilter('async');
  }
</script>

<FilterSection title="Times">
  {#snippet actions()}
    {#if criteria || hideAsync}
      <button class="filter-clear-btn" onclick={clear}>Clear</button>
    {/if}
  {/snippet}

  <div class={styles.panelRow}>
    <span class={styles.panelSummary}>{summary}</span>
    <button
      id="edit-times-btn"
      class="modal-btn btn-secondary"
      onclick={() => openModal('time-grid')}>Edit times…</button
    >
  </div>
</FilterSection>
