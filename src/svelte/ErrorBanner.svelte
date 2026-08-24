<script lang="ts">
  import { uiState } from '../services/ui/uiState.svelte';
  import { triggerFileDownload } from '../utils/download';
  import { STORAGE_KEYS } from '../utils/storageKeys';

  // Declarative replacement for UIStateManager.showErrorMessage's innerHTML
  // injection into #department-list/#course-container. showAppError() sets the
  // uiState.appError rune; this banner renders it above whatever page is active.
  const error = $derived(uiState.appError);

  let clearing = $state(false);
  let exporting = $state(false);
  let exportError = $state<string | null>(null);

  // Downloads everything "Clear Data & Reload" would destroy. The schedules
  // file comes from the same export the Schedule Picker uses, so it re-imports;
  // the degree record is a separate localStorage key that format doesn't cover.
  async function exportData(): Promise<void> {
    if (exporting) return;
    exporting = true;
    exportError = null;
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const result = await uiState.appError?.onExportData?.();

      if (!result?.success || !result.data) {
        // NOT showAppError: that replaces uiState.appError wholesale, which
        // would tear down this banner and lose its Clear Data action.
        exportError = `Export failed: ${result?.error ?? 'Unknown error'}`;
        return;
      }
      triggerFileDownload(
        result.data,
        `wpi-schedules-${timestamp}.json`,
        'application/json',
      );

      // Read raw rather than via loadDegreeRecord(), which validates and drops
      // an incompatible record - a pre-deletion backup wants the bytes as
      // stored, and this must not depend on degreeImportService.load() having
      // run (it's the last boot step, so it often hasn't when we get here).
      const degreeRecord = localStorage.getItem(STORAGE_KEYS.DEGREE_RECORD);
      if (degreeRecord !== null) {
        triggerFileDownload(
          degreeRecord,
          `wpi-degree-${timestamp}.json`,
          'application/json',
        );
      }
    } finally {
      exporting = false;
    }
  }

  async function clearDataAndReload(): Promise<void> {
    if (clearing) return;
    clearing = true;
    try {
      await uiState.appError?.onClearData?.();
    } finally {
      location.reload();
    }
  }
</script>

{#if error}
  <div class="error-banner" role="alert">
    <div class="error-banner-text">
      <p>{error.message}</p>
      {#if error.onClearData}
        <p>
          Your saved data may be outdated or deprecated. Clearing it will reset
          the app to a fresh state.
        </p>
      {/if}
      {#if exportError}
        <p class="error-banner-export-error">{exportError}</p>
      {/if}
    </div>
    <div class="error-banner-actions">
      {#if error.onExportData}
        <button
          class="btn"
          id="error-export-data-btn"
          disabled={exporting}
          onclick={exportData}
        >
          {exporting ? 'Exporting…' : 'Export Data'}
        </button>
      {/if}
      {#if error.onClearData}
        <button
          class="btn"
          id="error-clear-data-btn"
          disabled={clearing}
          onclick={clearDataAndReload}
        >
          {clearing ? 'Clearing…' : 'Clear Data & Reload'}
        </button>
      {/if}
      <button class="btn" onclick={() => (uiState.appError = null)}
        >Dismiss</button
      >
    </div>
  </div>
{/if}

<style>
  .error-banner {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2000;
    display: flex;
    align-items: center;
    gap: 1rem;
    max-width: min(40rem, calc(100vw - 2rem));
    padding: 0.75rem 1rem;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-error);
    border-radius: var(--effect-border-radius-large, 8px);
    box-shadow: var(--effect-shadow, 0 4px 16px rgba(0, 0, 0, 0.3));
  }

  .error-banner-text {
    color: var(--color-error);
    font-size: 0.9rem;
  }

  .error-banner-text p {
    margin: 0;
  }

  .error-banner-text p + p {
    margin-top: 0.25rem;
    color: var(--color-text-secondary);
  }

  /* Overrides the secondary colour p + p gives it: this is a failure, not
     supporting copy. Reported inline because showAppError would replace the
     whole banner. */
  .error-banner-text p + p.error-banner-export-error {
    color: var(--color-error);
  }

  .error-banner-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-shrink: 0;
  }
</style>
