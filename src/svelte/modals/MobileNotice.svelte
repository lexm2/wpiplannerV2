<script lang="ts">
  import Modal from './Modal.svelte';

  let { onRequestClose }: { onRequestClose: () => void } = $props();
</script>

<Modal
  typeId="mobile-notice"
  closeOnBackdrop={false}
  closeOnEscape={false}
  title="Mobile Not Supported"
  showHeader
  hideClose
  {onRequestClose}
>
  {#snippet children(close)}
    <div class="modal-body">
      <p>
        Mobile support was temporarily removed to make it easier to ship new
        features. Please use a desktop browser for the best experience.
      </p>
    </div>
    <div class="modal-footer">
      <button class="modal-btn btn-primary" onclick={close}>Got it</button>
    </div>
  {/snippet}
</Modal>
