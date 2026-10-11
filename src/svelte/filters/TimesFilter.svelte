<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import { openModal } from '../../services/ui/uiState.svelte';
  import { describeWindows } from '../../utils/timeWindows';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { TimesFilterCriteria } from '../../types/filters';
  import styles from '../../styles/components/time-grid.module.css';

  let { filterService }: { filterService: FilterService } = $props();

  const criteria = $derived(
    filterService.getCriteria<TimesFilterCriteria>('times'),
  );

  const summary = $derived(
    [
      criteria?.windows?.length
        ? describeWindows(criteria.windows, criteria.mode)
        : 'Any time',
      criteria?.includeAsync ? 'async included' : null,
    ]
      .filter(Boolean)
      .join(' • '),
  );

  function clear(): void {
    filterService.removeFilter('times');
  }
</script>

<FilterSection title="Times">
  {#snippet actions()}
    {#if criteria}
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
