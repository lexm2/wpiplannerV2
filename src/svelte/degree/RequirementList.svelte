<script lang="ts">
  import type { RequirementStatus } from '../../types/degree';
  import { untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import RequirementCard from './RequirementCard.svelte';
  import { degreeState } from './degreeState.svelte';
  import { courseDrag } from './courseDrag.svelte';
  import { degreeViewState } from './degreeViewState.svelte';
  import {
    bucketFocus,
    clearBucketFocus,
    runBucketFocus,
  } from './bucketFocus.svelte';
  import { openModal } from '../../services/ui/uiState.svelte';
  import { getInlineSVG } from '../../utils/iconPaths';
  import { UMBRELLA_CATEGORIES } from '../../services/degree/degreeBuckets';
  import { dur, slideFade } from '../transitions';
  import { phoneLayout } from '../phoneLayout.svelte';

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
    if (next.length === STATUSES.length) next = [];
    selected = next;
  }

  // Lives in degreeState: the phone's Move sheet offers the same buckets.
  const showUmbrella = $derived(degreeState.showUmbrella);
  const umbrellaCount = $derived(
    degreeState.buckets.filter(b => UMBRELLA_CATEGORIES.has(b.category)).length,
  );

  const visible = $derived(
    degreeState.buckets.filter(
      b => showUmbrella || !UMBRELLA_CATEGORIES.has(b.category),
    ),
  );

  // Filter/count by the live status, so a bucket that becomes satisfied moves
  // between filters in real time.
  const withStatus = $derived(
    visible.map(b => ({
      b,
      status: degreeState.progressById.get(b.id)?.status ?? b.status,
    })),
  );

  const filtered = $derived(
    allActive
      ? withStatus.map(x => x.b)
      : withStatus.filter(x => selected.includes(x.status)).map(x => x.b),
  );

  // Phone only: the chips, the degree-wide switch and the layout toggle fold
  // into a panel behind one Filter button beside the search bar.
  let filtersOpen = $state(false);
  const filtering = $derived(!allActive || showUmbrella);

  const counts = $derived({
    all: visible.length,
    not_satisfied: withStatus.filter(x => x.status === 'not_satisfied').length,
    in_progress: withStatus.filter(x => x.status === 'in_progress').length,
    satisfied: withStatus.filter(x => x.status === 'satisfied').length,
  });

  /**
   * A jump from the course finder ("this course counts toward Core") has to be
   * able to LAND: the card it names may be filtered out by the status chips, or
   * be a degree-wide aggregate the umbrella toggle is hiding. Both of those
   * knobs live here, so this is the only place that can clear the way - hence
   * the request being state rather than the modal scrolling the page itself.
   *
   * Tracks the request and nothing else; the body writes the two filters it may
   * have to relax, and would otherwise re-fire on its own writes.
   */
  $effect(() => {
    const request = bucketFocus.request;
    if (!request) return;
    untrack(() => {
      const targets = degreeState.buckets.filter(b =>
        request.ids.includes(b.id),
      );
      // The finder only names an aggregate the user placed a course in, so one
      // reaching here is a real destination and worth unhiding.
      if (targets.some(b => UMBRELLA_CATEGORIES.has(b.category)))
        degreeState.showUmbrella = true;
      // Widen to All rather than adding the missing status: the user asked for
      // one bucket, not for a filter set they never chose.
      if (
        selected.length &&
        targets.some(
          b =>
            !selected.includes(
              degreeState.progressById.get(b.id)?.status ?? b.status,
            ),
        )
      )
        selected = [];
      runBucketFocus(request);
      clearBucketFocus();
    });
  });
</script>

<!-- Shared by the wide layout's toolbar and the phone's. -->
{#snippet statusChips()}
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
        onclick={() => (degreeState.showUmbrella = !showUmbrella)}
        >{showUmbrella ? 'Hide' : 'Show'} degree-wide
        <span class="degree-filter-count">{umbrellaCount}</span></button
      >
    {/if}
  </div>
{/snippet}

{#snippet searchBar()}
  <!-- Opens the course finder, which searches courses and buckets alike. -->
  <button
    type="button"
    id="degree-course-search"
    class="degree-search-bar"
    onclick={() => openModal('course-finder')}
  >
    {@html getInlineSVG('SEARCH', 'degree-search-icon')}
    <span>Search courses or buckets</span>
  </button>
{/snippet}

{#snippet layoutToggle()}
  <div role="group" aria-label="Bucket layout" class="degree-view-group">
    <button
      type="button"
      id="degree-view-grid"
      class="degree-filter-chip"
      class:active={degreeViewState.bucketView === 'grid'}
      aria-pressed={degreeViewState.bucketView === 'grid'}
      onclick={() => degreeViewState.setBucketView('grid')}>Grid</button
    >
    <button
      type="button"
      id="degree-view-full"
      class="degree-filter-chip"
      class:active={degreeViewState.bucketView === 'full'}
      aria-pressed={degreeViewState.bucketView === 'full'}
      onclick={() => degreeViewState.setBucketView('full')}>Full</button
    >
  </div>
{/snippet}

<div class="degree-requirements">
  {#if phoneLayout.current}
    <!-- Sticks to the top of the page once scrolled to, like the Classes
         page's toolbar: search the courses, or narrow the buckets. The legend
         stays wide-only - each card's pill already names its status. -->
    <div class="degree-phone-toolbar">
      {@render searchBar()}
      <button
        type="button"
        id="degree-filter-btn"
        class="filter-btn"
        class:active={filtering}
        aria-label="Filter requirements"
        aria-expanded={filtersOpen}
        onclick={() => (filtersOpen = !filtersOpen)}
        >{@html getInlineSVG('FILTER_FILLED', 'filter-icon')}</button
      >
    </div>
    {#if filtersOpen}
      <div class="degree-filter-panel" transition:slideFade={{ duration: 180 }}>
        {@render statusChips()}
        <div class="degree-filter-layout">
          <span class="degree-filter-layout-label">Layout</span>
          {@render layoutToggle()}
        </div>
      </div>
    {/if}
  {:else}
    <!-- One row: search, status, layout. Each card's pill names its status,
         so the legend only explains the bar colours. -->
    <div class="degree-toolbar">
      {@render searchBar()}
      {@render statusChips()}
      {@render layoutToggle()}
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
  {/if}

  {#if filtered.length === 0}
    <p class="empty-state">No requirements match this filter.</p>
  {:else}
    <div
      class="degree-card-list"
      class:is-full={degreeViewState.bucketView === 'full'}
    >
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
