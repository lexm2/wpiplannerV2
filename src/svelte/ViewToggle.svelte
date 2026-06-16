<script lang="ts">
  import { uiState } from '../services/ui/uiState.svelte';
  import type { ViewMode } from '../types/uiState';
  import type { UIStateManager } from '../services/ui/UIStateManager';

  let { uiStateManager }: {
    uiStateManager: UIStateManager;
  } = $props();

  // `uiState.currentView` is a rune, so the reactive `class:` bindings below
  // replace UIStateManager.applyViewEffects()'s imperative class toggling.
  const view = $derived(uiState.currentView);

  // setView updates the uiState.currentView rune; CourseList derives its
  // list/grid layout from that rune, so the course list re-renders on its own
  // (no imperative refresh callback needed).
  function select(v: ViewMode): void {
    uiStateManager.setView(v);
  }
</script>

<button
  id="view-list"
  class="filter-btn filter-btn-wide"
  class:btn-primary={view === 'list'}
  class:active={view === 'list'}
  class:btn-secondary={view !== 'list'}
  onclick={() => select('list')}
>List</button>
<button
  id="view-grid"
  class="filter-btn filter-btn-wide"
  class:btn-primary={view === 'grid'}
  class:active={view === 'grid'}
  class:btn-secondary={view !== 'grid'}
  onclick={() => select('grid')}
>Grid</button>
