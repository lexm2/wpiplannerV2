<script lang="ts">
  import { uiState } from '../services/ui/uiState.svelte';
  import type { PageId } from '../types/uiState';
  import type { UIStateManager } from '../services/ui/UIStateManager';

  let { uiStateManager: _uiStateManager, onSwitch }: {
    uiStateManager: UIStateManager;
    onSwitch: (page: PageId) => void;
  } = $props();

  // `uiState.currentPage` is a rune, so the reactive `class:active` bindings
  // below replace UIStateManager.applyPageEffects()'s imperative tab class
  // toggling. The page-region display toggle stays in applyPageEffects (those
  // regions are still vanilla). onSwitch runs the same side-effects the old
  // MainController tab-click handlers did (close wizard / switch page / render).
  const page = $derived(uiState.currentPage);
</script>

<button
  id="planner-tab"
  class="nav-tab"
  class:active={page === 'planner'}
  aria-label="Classes view"
  onclick={() => onSwitch('planner')}
>Classes</button>
<button
  id="schedule-tab"
  class="nav-tab"
  class:active={page === 'schedule'}
  aria-label="Schedule view"
  onclick={() => onSwitch('schedule')}
>Schedule</button>
