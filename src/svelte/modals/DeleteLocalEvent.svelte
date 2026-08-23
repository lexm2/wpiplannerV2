<script lang="ts">
  import Modal from './Modal.svelte';
  import { modalState } from './modalState.svelte';

  let { onRequestClose }: { onRequestClose: () => void } = $props();

  const payload = $derived(modalState.deleteLocalEvent);
</script>

{#if payload}
  <Modal typeId="delete-local-event" title="Delete Event" {onRequestClose}>
    {#snippet children(close)}
      <div class="modal-header">
        <h2 class="modal-title">Delete Event</h2>
      </div>
      <div class="modal-body">
        <p>Delete "<strong>{payload.title}</strong>"?</p>
      </div>
      <div class="modal-footer">
        <button class="modal-btn btn-secondary" onclick={close}>Cancel</button>
        <button
          class="modal-btn btn-danger"
          onclick={() => {
            payload.onConfirm();
            close();
          }}>Delete</button
        >
      </div>
    {/snippet}
  </Modal>
{/if}
