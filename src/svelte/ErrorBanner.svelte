<script lang="ts">
  import { uiState } from '../services/ui/uiState.svelte';
  import { showConfirm } from './modals/modalState.svelte';
  import { triggerFileDownload } from '../utils/download';
  import { STORAGE_KEYS } from '../utils/storageKeys';

  // showAppError() sets the uiState.appError rune; this banner renders it above
  // whatever page is active.
  const error = $derived(uiState.appError);

  let clearing = $state(false);
  let retrying = $state(false);
  let exporting = $state(false);
  // Tagged with the error it was raised under, so a new error doesn't inherit
  // the previous one's export failure.
  let exportFailure = $state<{ for: typeof error; message: string } | null>(
    null,
  );
  const exportError = $derived(
    exportFailure?.for === error ? exportFailure.message : null,
  );

  // Downloads everything "Clear Data & Reload" would destroy. The schedules
  // file comes from the same export the Schedule Picker uses, so it re-imports;
  // the degree record is a separate localStorage key that format doesn't cover.
  async function exportData(): Promise<void> {
    if (exporting) return;
    exporting = true;
    exportFailure = null;
    const forError = error;
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const result = await uiState.appError?.onExportData?.();

      if (!result?.success || !result.data) {
        // NOT showAppError: that replaces uiState.appError wholesale, which
        // would tear down this banner and lose its Clear Data action.
        exportFailure = {
          for: forError,
          message: `Export failed: ${result?.error ?? 'Unknown error'}`,
        };
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
    } catch (err) {
      exportFailure = {
        for: forError,
        message: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      exporting = false;
    }
  }

  // Wiping is irreversible, so it asks first, in the app's own dialog.
  function clearDataAndReload(): void {
    if (clearing) return;
    showConfirm({
      title: 'Clear all data',
      message:
        'This deletes ALL saved schedules, your degree record and your preferences, then reloads the planner.\n' +
        'Use Export Data first if you want a copy.\n' +
        'This action CANNOT be undone.',
      confirmLabel: 'Clear everything',
      variant: 'danger',
      onConfirm: () => void runClear(),
    });
  }

  // The clear reloads the page itself once storage is empty.
  async function runClear(): Promise<void> {
    const forError = error;
    clearing = true;
    try {
      await uiState.appError?.onClearData?.();
    } catch (err) {
      clearing = false;
      exportFailure = {
        for: forError,
        message: `Clearing failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async function retry(): Promise<void> {
    if (retrying) return;
    const forError = error;
    retrying = true;
    exportFailure = null;
    try {
      await uiState.appError?.onRetry?.();
      if (uiState.appError === forError) uiState.appError = null;
    } catch {
      exportFailure = {
        for: forError,
        message: 'Still unable to load the course catalog.',
      };
    } finally {
      retrying = false;
    }
  }
</script>

{#if error}
  <div class="error-banner" role="alert">
    <div class="error-banner-text">
      <p class="error-banner-message">{error.message}</p>
      {#if error.onClearData}
        <p>
          If the problem comes from your saved data, clearing it resets the app
          to a fresh state.
        </p>
      {/if}
      {#if exportError}
        <p class="error-banner-export-error">{exportError}</p>
      {/if}
    </div>
    <div class="error-banner-actions">
      {#if error.onRetry}
        <button
          class="btn btn-primary"
          id="error-retry-btn"
          disabled={retrying}
          onclick={retry}
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      {/if}
      {#if error.onExportData}
        <button
          class="btn btn-secondary"
          id="error-export-data-btn"
          disabled={exporting}
          onclick={exportData}
        >
          {exporting ? 'Exporting…' : 'Export Data'}
        </button>
      {/if}
      {#if error.onClearData}
        <button
          class="btn btn-secondary"
          id="error-clear-data-btn"
          disabled={clearing}
          onclick={clearDataAndReload}
        >
          {clearing ? 'Clearing…' : 'Clear Data & Reload'}
        </button>
      {/if}
      <button
        class="btn btn-secondary"
        onclick={() => (uiState.appError = null)}>Dismiss</button
      >
    </div>
  </div>
{/if}

<style>
  .error-banner {
    position: fixed;
    /* Under the header, which carries the page tabs: a banner over them would
       leave Classes / Schedule / Degree unclickable until it was dismissed. */
    top: calc(var(--spacing-header-height) + 0.5rem);
    /* Centred between 1rem gutters. A bare left: 50% + translateX(-50%) left the
       box no width to grow into and capped it near half the viewport (200px at
       320px, 384px at 768px). */
    left: 1rem;
    right: 1rem;
    margin-inline: auto;
    width: fit-content;
    z-index: 2000;
    display: flex;
    align-items: center;
    gap: 1rem;
    max-width: 40rem;
    padding: 0.75rem 1rem;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-error);
    border-radius: var(--effect-border-radius-large, 8px);
    box-shadow: var(--effect-shadow, 0 4px 16px rgba(0, 0, 0, 0.3));
  }

  /* The red border says "error"; the text stays in the body colour, since the
     error red does not reach 4.5:1 on the elevated surface. */
  .error-banner-text {
    color: var(--color-text);
    font-size: 0.9rem;
  }

  .error-banner-text p {
    margin: 0;
  }

  /* Messages carry their own line breaks (e.g. a "\n•" list of causes). */
  .error-banner-message {
    white-space: pre-line;
  }

  .error-banner-text p + p {
    margin-top: 0.25rem;
    color: var(--color-text-secondary);
  }

  /* Overrides the secondary colour p + p gives it: this is a failure, not
     supporting copy. Reported inline because showAppError would replace the
     whole banner. */
  .error-banner-text p + p.error-banner-export-error {
    color: var(--color-text);
  }

  .error-banner-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* Phone: the message gets the full width, with the actions in a wrapping row
     under it rather than a column beside it. */
  @media (max-width: 560px) {
    .error-banner {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }

    .error-banner-actions {
      flex-direction: row;
      flex-wrap: wrap;
      flex-shrink: 1;
    }
  }
</style>
