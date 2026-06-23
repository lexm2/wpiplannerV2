<script lang="ts">
  import type { StudentRecord, RequirementStatus } from '../../types/degree';
  import RequirementCard from './RequirementCard.svelte';

  let { record }: { record: StudentRecord } = $props();

  type Filter = 'all' | RequirementStatus;
  let filter = $state<Filter>('all');

  // Hide the synthetic "Unused Courses" bucket — it's always Not Satisfied and
  // isn't a real requirement.
  const visible = $derived(record.requirements.filter(r => r.category !== 'unused'));

  const filtered = $derived(
    filter === 'all' ? visible : visible.filter(r => r.status === filter)
  );

  const counts = $derived({
    all: visible.length,
    not_satisfied: visible.filter(r => r.status === 'not_satisfied').length,
    in_progress: visible.filter(r => r.status === 'in_progress').length,
    satisfied: visible.filter(r => r.status === 'satisfied').length,
  });

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'not_satisfied', label: 'Not satisfied' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'satisfied', label: 'Satisfied' },
  ];
</script>

<div class="degree-requirements">
  <div class="degree-filter-row" role="tablist" aria-label="Filter requirements by status">
    {#each filters as f}
      <button
        type="button"
        class="degree-filter-chip"
        class:active={filter === f.key}
        role="tab"
        aria-selected={filter === f.key}
        onclick={() => (filter = f.key)}
      >{f.label} <span class="degree-filter-count">{counts[f.key]}</span></button>
    {/each}
  </div>

  {#if filtered.length === 0}
    <p class="degree-empty-list">No requirements match this filter.</p>
  {:else}
    <div class="degree-card-list">
      {#each filtered as req (req.rawName)}
        <RequirementCard {req} />
      {/each}
    </div>
  {/if}
</div>
