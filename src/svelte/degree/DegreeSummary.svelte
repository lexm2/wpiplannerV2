<script lang="ts">
  import type { StudentRecord } from '../../types/degree';
  import type { DegreeImportService } from '../../services/degree/degreeImportService';
  import { openModal } from '../../services/ui/uiState.svelte';
  import { showConfirm } from '../modals/modalState.svelte';

  let {
    record,
    degreeImportService,
  }: {
    record: StudentRecord;
    degreeImportService: DegreeImportService;
  } = $props();

  let fileInput = $state<HTMLInputElement | null>(null);

  const required = $derived(record.credits.required);
  // Overall progress = completed (earned, incl. transfer) toward the degree total.
  const overallPct = $derived(
    required && required > 0
      ? Math.min(100, Math.round((record.credits.earned / required) * 100))
      : null,
  );

  const title = $derived(
    [record.major, record.degree].filter(Boolean).join(' · ') ||
      'Academic Progress',
  );

  function clearRecord(): void {
    showConfirm({
      title: 'Clear degree record',
      message: 'Are you sure you want to do this?',
      confirmLabel: 'Clear',
      variant: 'danger',
      onConfirm: () => degreeImportService.clear(),
    });
  }

  async function onInputChange(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      try {
        await degreeImportService.importFromFile(file);
      } catch {
        /* surfaced in state */
      }
    }
  }
</script>

<section class="degree-summary">
  <div class="degree-summary-head">
    <div>
      <h2 class="degree-summary-title">{title}</h2>
      {#if record.startYear}
        <p class="degree-summary-sub">Entered {record.startYear}</p>
      {/if}
    </div>
    <div class="degree-summary-actions">
      <button
        type="button"
        class="btn btn-primary"
        id="degree-configure-buckets-btn"
        onclick={() => openModal('bucket-config')}>Configure buckets</button
      >
      <button
        type="button"
        class="btn btn-secondary"
        onclick={() => fileInput?.click()}>Re-import</button
      >
      <button type="button" class="btn btn-secondary" onclick={clearRecord}
        >Clear</button
      >
      <input
        bind:this={fileInput}
        type="file"
        accept=".xlsx"
        id="degree-reimport-file"
        class="degree-file-input"
        onchange={onInputChange}
      />
    </div>
  </div>

  {#if overallPct !== null}
    <div class="degree-progress">
      <div class="degree-progress-bar">
        <div class="degree-progress-fill" style:width="{overallPct}%"></div>
      </div>
      <span class="degree-progress-label"
        >{overallPct}% of {required} credits</span
      >
    </div>
  {/if}

  <div class="degree-credit-stats">
    <div class="degree-stat">
      <span class="degree-stat-value">{record.credits.earned}</span><span
        class="degree-stat-label">Earned</span
      >
    </div>
    <div class="degree-stat">
      <span class="degree-stat-value">{record.credits.inProgress}</span><span
        class="degree-stat-label">In progress</span
      >
    </div>
    <div class="degree-stat">
      <span class="degree-stat-value">{record.credits.transfer}</span><span
        class="degree-stat-label">Transfer</span
      >
    </div>
    <div class="degree-stat">
      <span class="degree-stat-value">{required ?? '-'}</span><span
        class="degree-stat-label">Required</span
      >
    </div>
  </div>
</section>
