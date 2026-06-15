<script lang="ts">
  import Modal from './Modal.svelte';
  import { getInlineSVG } from '../../utils/iconPaths';
  import type { TutorialSetup } from '../../services/tutorial/setupTutorial';

  let { onRequestClose, tutorial }: {
    onRequestClose: () => void;
    tutorial: TutorialSetup;
  } = $props();
</script>

<Modal typeId="tutorials" title="Tutorials" {onRequestClose}>
  {#snippet children(close)}
    <div class="modal-header">
      <h2 class="modal-title">Tutorials</h2>
      <button class="modal-close" aria-label="Close" onclick={close}>&times;</button>
    </div>
    <div class="modal-body tutorials-modal-body">
      {#each tutorial.tutorials as t (t.id)}
        <button
          class="btn btn-secondary tutorial-list-btn"
          data-tutorial-id={t.id}
          onclick={() => { close(); tutorial.start(t.id); }}
        >
          {@html getInlineSVG('CALENDAR_REPEAT', 'modal-footer-icon')}
          <span class="btn-text">{t.label}</span>
        </button>
      {/each}
    </div>
  {/snippet}
</Modal>
