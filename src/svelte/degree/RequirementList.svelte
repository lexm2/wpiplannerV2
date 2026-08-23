<script lang="ts">
  import type {
    StudentRecord,
    RequirementStatus,
    RequirementCategory,
  } from '../../types/degree';
  import RequirementCard from './RequirementCard.svelte';
  import { effectiveProgress } from '../../services/degree/requirementProgress';
  import { degreeState } from './degreeState.svelte';

  let { record }: { record: StudentRecord } = $props();

  // Status filter is multi-select: pick any combination of statuses. An empty
  // selection means "All"; selecting every status collapses back to All.
  const STATUSES: { key: RequirementStatus; label: string }[] = [
    { key: 'not_satisfied', label: 'Not satisfied' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'satisfied', label: 'Satisfied' },
  ];
  let selected = $state<RequirementStatus[]>([]);
  const allActive = $derived(selected.length === 0);

  function toggleStatus(s: RequirementStatus): void {
    let next = selected.includes(s)
      ? selected.filter(x => x !== s)
      : [...selected, s];
    if (next.length === STATUSES.length) next = []; // all selected → collapse to All
    selected = next;
  }

  // "Umbrella" requirements are degree-wide aggregates (total credits, residency)
  // that accumulate every course rather than naming a specific bucket to fill, so
  // they're hidden by default behind a toggle.
  const UMBRELLA = new Set<RequirementCategory>(['total_credits', 'residency']);
  let showUmbrella = $state(false);
  const umbrellaCount = $derived(
    record.requirements.filter(r => UMBRELLA.has(r.category)).length,
  );

  // Hide the synthetic "Unused Courses" bucket - it's always Not Satisfied and
  // isn't a real requirement - plus umbrella requirements unless toggled on.
  const visible = $derived(
    record.requirements.filter(
      r =>
        r.category !== 'unused' && (showUmbrella || !UMBRELLA.has(r.category)),
    ),
  );

  // Filter/count by the *live* status (reflects schedule overlay + drag moves),
  // so a requirement that becomes satisfied moves between filters in real time.
  const withStatus = $derived(
    visible.map(r => ({
      r,
      status: effectiveProgress(r, degreeState.placements.get(r.rawName) ?? [])
        .status,
    })),
  );

  const filtered = $derived(
    allActive
      ? withStatus.map(x => x.r)
      : withStatus.filter(x => selected.includes(x.status)).map(x => x.r),
  );

  const counts = $derived({
    all: visible.length,
    not_satisfied: withStatus.filter(x => x.status === 'not_satisfied').length,
    in_progress: withStatus.filter(x => x.status === 'in_progress').length,
    satisfied: withStatus.filter(x => x.status === 'satisfied').length,
  });
</script>

<div class="degree-requirements">
  <div
    class="degree-filter-row"
    role="group"
    aria-label="Filter requirements by status"
  >
    <button
      type="button"
      class="degree-filter-chip"
      class:active={allActive}
      aria-pressed={allActive}
      onclick={() => (selected = [])}
      >All <span class="degree-filter-count">{counts.all}</span></button
    >
    {#each STATUSES as s}
      <button
        type="button"
        class="degree-filter-chip"
        class:active={selected.includes(s.key)}
        aria-pressed={selected.includes(s.key)}
        onclick={() => toggleStatus(s.key)}
        >{s.label}
        <span class="degree-filter-count">{counts[s.key]}</span></button
      >
    {/each}
    {#if umbrellaCount > 0}
      <button
        type="button"
        class="degree-filter-chip degree-umbrella-toggle"
        class:active={showUmbrella}
        aria-pressed={showUmbrella}
        onclick={() => (showUmbrella = !showUmbrella)}
        >{showUmbrella ? 'Hide' : 'Show'} degree-wide
        <span class="degree-filter-count">{umbrellaCount}</span></button
      >
    {/if}
  </div>

  <div class="degree-progress-legend" aria-hidden="true">
    <span class="degree-legend-item"
      ><span class="degree-legend-swatch seg-earned"></span> Completed</span
    >
    <span class="degree-legend-item"
      ><span class="degree-legend-swatch seg-planned"></span> Planned</span
    >
    <span class="degree-legend-item"
      ><span class="degree-legend-swatch seg-schedule"></span> Schedule</span
    >
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
