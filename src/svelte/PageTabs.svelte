<script lang="ts">
  import { uiState } from '../services/ui/uiState.svelte';
  import type { PageId } from '../types/uiState';

  let {
    onSwitch,
  }: {
    onSwitch: (page: PageId) => void;
  } = $props();

  // onSwitch runs the page-switch side-effects (close wizard / switch page) in
  // App.svelte.
  const page = $derived(uiState.currentPage);
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
