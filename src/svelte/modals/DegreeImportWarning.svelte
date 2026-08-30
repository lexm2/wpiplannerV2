<script lang="ts">
  import Modal from './Modal.svelte';

  let { onRequestClose }: { onRequestClose: () => void } = $props();

  const TRACKING_SHEETS =
    'https://www.wpi.edu/student-experience/resources/academic-advising/program-tracking-sheets';
</script>

<Modal
  typeId="degree-import-warning"
  title="Import complete - please verify"
  showHeader
  dialogClass="degree-warning-dialog"
  {onRequestClose}
>
  {#snippet children(close)}
    <div class="modal-body">
      <p>
        Degree planning is an <strong>experimental feature</strong>. The
        importer reads your Workday academic progress export creates buckets
        automatically. Mistakes are possible.
      </p>
      <p>
        Always confirm what you see here against WPI's official
        <a
          href={TRACKING_SHEETS}
          target="_blank"
          rel="noopener noreferrer"
          class="degree-warning-link">program tracking sheets</a
        >
        and with your academic advisor before making registration decisions.
      </p>
    </div>
    <div class="modal-footer">
      <a
        class="modal-btn btn-secondary"
        href={TRACKING_SHEETS}
        target="_blank"
        rel="noopener noreferrer">Tracking sheets</a
      >
      <button class="modal-btn btn-primary" onclick={close}>Got it</button>
    </div>
  {/snippet}
</Modal>
