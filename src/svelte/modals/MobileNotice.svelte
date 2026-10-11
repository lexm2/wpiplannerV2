<script lang="ts">
  import Modal from './Modal.svelte';

  let { onRequestClose }: { onRequestClose: () => void } = $props();
</script>

<Modal
  typeId="mobile-notice"
  closeOnBackdrop={false}
  closeOnEscape={false}
  title="Limited Mobile Support"
  showHeader
  hideClose
  {onRequestClose}
>
  {#snippet children(close)}
    <div class="modal-body">
      <p>
        The planner is built for desktop. On a phone the side panels open as
        drawers from the header and toolbar buttons, but a desktop browser gives
        the best experience.
      </p>
    </div>
    <div class="modal-footer">
      <button class="modal-btn btn-primary" onclick={close}>Got it</button>
    </div>
  {/snippet}
</Modal>
