<script lang="ts">
  import { uiState } from '../services/ui/uiState.svelte';

  // Declarative replacement for UIStateManager.showErrorMessage's innerHTML
  // injection into #department-list/#course-container. showAppError() sets the
  // uiState.appError rune; this banner renders it above whatever page is active.
  const error = $derived(uiState.appError);

  let clearing = $state(false);

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
    </div>
    <div class="error-banner-actions">
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

  .error-banner-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-shrink: 0;
  }
</style>
