<script lang="ts">
  import { uiState, setView } from '../services/ui/uiState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';

  // One button that flips the Classes page between list and grid, showing the
  // view it switches to - the settings menu's item does the same.
  const other = $derived(uiState.currentView === 'list' ? 'grid' : 'list');
  const label = $derived(other === 'grid' ? 'Grid view' : 'List view');
</script>

<button
  id="view-toggle-btn"
  class="filter-btn"
  title={label}
  aria-label={label}
  onclick={() => setView(other)}
  >{@html getInlineSVG(
    other === 'grid' ? 'LAYOUT_GRID' : 'LAYOUT_LIST',
    'view-toggle-icon',
  )}</button
>
