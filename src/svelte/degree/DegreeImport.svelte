<script lang="ts">
  import type { DegreeImportService } from '../../services/degree/degreeImportService';
  import { degreeState } from './degreeState.svelte';
  import { openModal } from '../../services/ui/uiState.svelte';

  let { degreeImportService }: { degreeImportService: DegreeImportService } =
    $props();

  let fileInput = $state<HTMLInputElement | null>(null);
  let dragOver = $state(false);

  const parsing = $derived(degreeState.status === 'parsing');
  const error = $derived(degreeState.errorMessage);

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      await degreeImportService.importFromFile(file);
      // Import succeeded: the bucketing is best-effort, so make the caveat
      // unmissable before the student reads anything into the result.
      openModal('degree-import-warning');
    } catch {
      // Error surfaced via degreeState.errorMessage.
    }
  }

  function onInputChange(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    void handleFile(input.files?.[0]);
    input.value = '';
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault();
    dragOver = false;
    void handleFile(e.dataTransfer?.files?.[0]);
  }
</script>

<div class="degree-import">
  <div
    class="degree-dropzone"
    class:drag-over={dragOver}
    role="button"
    tabindex="0"
    onclick={() => fileInput?.click()}
    onkeydown={e => (e.key === 'Enter' || e.key === ' ') && fileInput?.click()}
    ondragover={e => {
      e.preventDefault();
      dragOver = true;
    }}
    ondragleave={() => (dragOver = false)}
    ondrop={onDrop}
  >
    <h2 class="degree-dropzone-title">Import your Academic Progress</h2>
    <p class="degree-dropzone-hint">
      Drop your <strong>.xlsx</strong> here, or click to browse.
    </p>
    {#if parsing}
      <p class="degree-dropzone-status">Reading file…</p>
    {:else}
      <button
        type="button"
        class="btn degree-import-btn"
        onclick={e => {
          e.stopPropagation();
          fileInput?.click();
        }}
      >
        Choose file
      </button>
    {/if}
    {#if error}
      <p class="degree-dropzone-error">{error}</p>
    {/if}
    <input
      bind:this={fileInput}
      type="file"
      accept=".xlsx"
      id="degree-import-file"
      class="degree-file-input"
      onchange={onInputChange}
    />
  </div>

  <div class="degree-import-help">
    <h3>How to export from Workday</h3>
    <ol>
      <li>
        In Workday, search for and open <strong
          >View My Academic Progress</strong
        >.
      </li>
      <li>
        Click the <strong>Export to Excel</strong> icon at the top of the requirements
        grid.
      </li>
      <li>Upload the downloaded <code>.xlsx</code> file here.</li>
    </ol>
    <p class="degree-privacy-note">
      Your academic record is parsed in your browser and stored only on this
      device. It is never uploaded.
    </p>
  </div>
</div>
