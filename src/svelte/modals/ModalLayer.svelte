<script lang="ts">
  import { uiState } from '../../services/ui/uiState.svelte';
  import MobileNotice from './MobileNotice.svelte';
  import Changelog from './Changelog.svelte';
  import Tutorials from './Tutorials.svelte';
  import SectionInfo from './SectionInfo.svelte';
  import DeleteLocalEvent from './DeleteLocalEvent.svelte';
  import LocalEvent from './LocalEvent.svelte';
  import type { UIStateManager } from '../../services/ui/UIStateManager';
  import type { TutorialSetup } from '../../services/tutorial/setupTutorial';

  let { uiStateManager, getTutorial }: {
    uiStateManager: UIStateManager;
    // Thunk, not a value: services.tutorial is assigned after MainController is
    // constructed (and after this layer mounts), so it must be read lazily at
    // render time. The {#each} re-runs on every uiState.openModals change, so
    // reading it when 'tutorials' opens returns the (by-then-set) instance.
    getTutorial: () => TutorialSetup | undefined;
  } = $props();

  // Single declarative modal layer. Renders a Svelte component for each open
  // modal type-id it KNOWS about (the registry below) and ignores the rest —
  // vanilla modals (BaseModal/ModalService) push their ids into
  // uiState.openModals too, but render themselves via ModalService, so the
  // layer skipping unknown ids avoids any double render.
  //
  // Closing goes through uiStateManager.modalClosed(id) so uiState.openModals
  // stays the single source of truth (keeping tutorial snapshots correct);
  // that removal unmounts the component, after its 200ms hide animation has
  // already played. Payload modals (section-info, delete-local-event) read
  // their data from modalState (set by the vanilla trigger sites before
  // modalOpened).
</script>

{#each uiState.openModals as id (id)}
  {#if id === 'mobile-notice'}
    <MobileNotice onRequestClose={() => uiStateManager.modalClosed('mobile-notice')} />
  {:else if id === 'changelog'}
    <Changelog onRequestClose={() => uiStateManager.modalClosed('changelog')} />
  {:else if id === 'tutorials'}
    {@const tutorial = getTutorial()}
    {#if tutorial}
      <Tutorials {tutorial} onRequestClose={() => uiStateManager.modalClosed('tutorials')} />
    {/if}
  {:else if id === 'section-info'}
    <SectionInfo onRequestClose={() => uiStateManager.modalClosed('section-info')} />
  {:else if id === 'delete-local-event'}
    <DeleteLocalEvent onRequestClose={() => uiStateManager.modalClosed('delete-local-event')} />
  {:else if id === 'local-event'}
    <LocalEvent onRequestClose={() => uiStateManager.modalClosed('local-event')} />
  {/if}
{/each}
