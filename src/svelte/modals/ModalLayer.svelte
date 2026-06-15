<script lang="ts">
  import { uiState } from '../../services/ui/uiState.svelte';
  import MobileNotice from './MobileNotice.svelte';
  import type { UIStateManager } from '../../services/ui/UIStateManager';

  let { uiStateManager }: { uiStateManager: UIStateManager } = $props();

  // Single declarative modal layer. Renders a Svelte component for each open
  // modal type-id it KNOWS about (the registry below) and ignores the rest —
  // vanilla modals (BaseModal/ModalService) push their ids into
  // uiState.openModals too, but render themselves via ModalService, so the
  // layer skipping unknown ids avoids any double render.
  //
  // For 11A the only migrated modal is 'mobile-notice'. Closing goes through
  // uiStateManager.modalClosed(id) so uiState.openModals stays the single
  // source of truth (keeping tutorial snapshots correct); that removal unmounts
  // the component, after its 200ms hide animation has already played.
</script>

{#each uiState.openModals as id (id)}
  {#if id === 'mobile-notice'}
    <MobileNotice onRequestClose={() => uiStateManager.modalClosed('mobile-notice')} />
  {/if}
{/each}
