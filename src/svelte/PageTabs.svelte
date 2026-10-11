<script lang="ts">
  import { uiState } from '../services/ui/uiState.svelte';
  import { PAGE_ORDER, pageDrag } from './pageSwipe.svelte';
  import type { PageId } from '../types/uiState';

  let {
    onSwitch,
  }: {
    onSwitch: (page: PageId) => void;
  } = $props();

  // onSwitch runs the page-switch side-effects (close wizard / switch page) in
  // App.svelte.
  const page = $derived(uiState.currentPage);

  // The phone tab bar's marker: one bar that slides to the current tab, and
  // tracks a page swipe as it happens (header.css; hidden on desktop).
  const markerAt = $derived(PAGE_ORDER.indexOf(page) - pageDrag.offset);
</script>

<button
  id="planner-tab"
  class="nav-tab"
  class:active={page === 'planner'}
  aria-label="Classes view"
  onclick={() => onSwitch('planner')}>Classes</button
>
<button
  id="schedule-tab"
  class="nav-tab"
  class:active={page === 'schedule'}
  aria-label="Schedule view"
  onclick={() => onSwitch('schedule')}>Schedule</button
>
<button
  id="degree-tab"
  class="nav-tab"
  class:active={page === 'degree'}
  aria-label="Degree view"
  onclick={() => onSwitch('degree')}>Degree</button
>
<span
  class="nav-tab-marker"
  class:dragging={pageDrag.dragging}
  style:--tab-pos={markerAt}
  aria-hidden="true"
></span>
