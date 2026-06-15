<script lang="ts">
  import { uiState } from '../services/ui/uiState.svelte';
  import type { ViewMode } from '../types/uiState';
  import type { UIStateManager } from '../services/ui/UIStateManager';

  let { uiStateManager, onSelect }: {
    uiStateManager: UIStateManager;
    onSelect: () => void;
  } = $props();

  // `uiState.currentView` is a rune, so the reactive `class:` bindings below
  // replace UIStateManager.applyViewEffects()'s imperative class toggling.
  const view = $derived(uiState.currentView);

  // Match the old MainController handler: call setView, then onSelect
  // (= refreshCurrentView) regardless of whether the view changed. setView
  // early-returns when unchanged, so onSelect is what re-renders the (still
  // vanilla) course list either way.
  function select(v: ViewMode): void {
    uiStateManager.setView(v);
    onSelect();
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
