<script lang="ts">
  import type {
    RequirementStatus,
    RequirementCategory,
  } from '../../types/degree';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import RequirementCard from './RequirementCard.svelte';
  import { effectiveProgress } from '../../services/degree/requirementProgress';
  import { degreeState } from './degreeState.svelte';
  import { courseDrag } from './courseDrag.svelte';
  import { dur } from '../transitions';

  /**
   * Cards glide when the grid reflows - a filter change, or a card expanding.
   *
   * Never mid-drag, though: flip animates `transform`, and a transformed
   * ancestor becomes the containing block for the position:fixed tile
   * courseDrag is flying across the page. Returning a bare config (no `css`)
   * writes no styles at all, which `flip(..., {duration: 0})` would not.
   */
  function cardFlip(node: Element, rects: { from: DOMRect; to: DOMRect }) {
    if (courseDrag.courseId !== null) return { duration: 0 };
    return flip(node, rects, { duration: dur(220), easing: cubicOut });
  }

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

  // "Umbrella" buckets are degree-wide aggregates (total credits, residency)
  // that accumulate every course rather than naming something to fill, so
  // they're hidden behind a toggle.
  const UMBRELLA = new Set<RequirementCategory>(['total_credits', 'residency']);
  let showUmbrella = $state(false);
  const umbrellaCount = $derived(
    degreeState.buckets.filter(b => UMBRELLA.has(b.category)).length,
  );

  const visible = $derived(
    degreeState.buckets.filter(b => showUmbrella || !UMBRELLA.has(b.category)),
  );

  // Filter/count by the live status, so a bucket that becomes satisfied moves
  // between filters in real time.
  const withStatus = $derived(
    visible.map(b => ({
      b,
      status: effectiveProgress(b, degreeState.placements.get(b.id) ?? [])
        .status,
    })),
  );

  const filtered = $derived(
    allActive
      ? withStatus.map(x => x.b)
      : withStatus.filter(x => selected.includes(x.status)).map(x => x.b),
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
    {#each STATUSES as s (s.key)}
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
    <p class="empty-state">No requirements match this filter.</p>
  {:else}
    <div class="degree-card-list">
      {#each filtered as bucket (bucket.id)}
        <!-- animate: needs an element that is an immediate child of the keyed
             {#each}, and a component is not one - hence the cell wrapper.
             data-bucket-id stays on the card itself: that is what the drag
             hit-test and the e2e drag-over assertion both look for. -->
        <div class="requirement-card-cell" animate:cardFlip>
          <RequirementCard {bucket} />
        </div>
      {/each}
    </div>
  {/if}
</div>
