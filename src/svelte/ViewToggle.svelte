<script lang="ts">
  import { uiState, setView } from '../services/ui/uiState.svelte';

  const view = $derived(uiState.currentView);
</script>

<button
  id="view-list"
  class="filter-btn filter-btn-wide"
  class:btn-primary={view === 'list'}
  class:active={view === 'list'}
  class:btn-secondary={view !== 'list'}
  onclick={() => setView('list')}>List</button
>
<button
  id="view-grid"
  class="filter-btn filter-btn-wide"
  class:btn-primary={view === 'grid'}
  class:active={view === 'grid'}
  class:btn-secondary={view !== 'grid'}
  onclick={() => setView('grid')}>Grid</button
>
