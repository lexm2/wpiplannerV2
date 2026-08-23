<script lang="ts">
  import Modal from './Modal.svelte';
  import { getInlineSVG } from '../../utils/iconPaths';
  import { logger } from '../../utils/logger';
  import { showAppError } from '../../services/ui/uiState.svelte';
  import type { TutorialSetup } from '../../services/tutorial/setupTutorial';

  let {
    onRequestClose,
    tutorial,
  }: {
    onRequestClose: () => void;
    tutorial: TutorialSetup;
  } = $props();
</script>

<Modal typeId="tutorials" title="Tutorials" showHeader {onRequestClose}>
  {#snippet children(close)}
    <div class="modal-body tutorials-modal-body">
      {#each tutorial.tutorials as t (t.id)}
        <button
          class="btn btn-secondary tutorial-list-btn"
          data-tutorial-id={t.id}
          onclick={() => {
            close();
            // The modal is already closed by the time start() can reject, so
            // without this a failure leaves the user looking at nothing.
            tutorial.start(t.id).catch((error: unknown) => {
              logger.error('Failed to start tutorial:', error);
              showAppError('Failed to start tutorial. Please try again.');
            });
          }}
        >
          {@html getInlineSVG('CALENDAR_REPEAT', 'modal-footer-icon')}
          <span class="btn-text">{t.label}</span>
        </button>
      {/each}
    </div>
  {/snippet}
</Modal>
