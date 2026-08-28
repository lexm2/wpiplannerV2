<script lang="ts">
  import { fly } from 'svelte/transition';
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import { dur } from './transitions';

  // The dropdown is position:fixed (anchored to the viewport), so rendering it
  // inside the header rather than in the body places it identically. Actions are
  // passed in so the undo/redo error handling + modal opening stay in App.svelte.
  let {
    onSchedules,
    onToggleTheme,
    onUndo,
    onRedo,
  }: {
    onSchedules: () => void;
    onToggleTheme: () => void;
    onUndo: () => void;
    onRedo: () => void;
  } = $props();

  let open = $state(false);

  // appState.canUndo/canRedo are runes published by UndoRedoManager - the same
  // source the header UndoRedoButtons use - so the items' disabled state stays
  // in sync.
  const canUndo = $derived(appState.canUndo);
  const canRedo = $derived(appState.canRedo);

  function toggle(e: MouseEvent): void {
    // Stop propagation so the window handler below doesn't immediately close it.
    e.stopPropagation();
    open = !open;
  }
</script>

<!-- Clicking anywhere else closes the menu (item clicks bubble here too, which
     closes it after their action runs). -->
<svelte:window onclick={() => (open = false)} />

<button
  id="settings-menu-btn"
  class="btn btn-icon settings-menu-btn"
  title="Settings"
  aria-label="Settings menu"
  onclick={toggle}>{@html getInlineSVG('SETTINGS', 'settings-icon')}</button
>

{#if open}
  <div
    class="settings-dropdown-menu"
    id="settings-dropdown-menu"
    transition:fly={{ y: -10, duration: dur(200) }}
  >
    <button class="settings-menu-item" onclick={onSchedules}>
      {@html getInlineSVG('CALENDAR_UP', 'menu-item-icon')}<span>Schedules</span
      >
    </button>
    <button
      class="settings-menu-item"
      id="settings-theme-btn"
      onclick={onToggleTheme}
    >
      {@html getInlineSVG('BRIGHTNESS', 'menu-item-icon')}<span
        >Toggle Theme</span
      >
    </button>
    <button
      class="settings-menu-item"
      id="settings-undo-btn"
      disabled={!canUndo}
      onclick={onUndo}
    >
      {@html getInlineSVG('ARROW_BACK_UP', 'menu-item-icon')}<span>Undo</span>
    </button>
    <button
      class="settings-menu-item"
      id="settings-redo-btn"
      disabled={!canRedo}
      onclick={onRedo}
    >
      {@html getInlineSVG('ARROW_FORWARD_UP', 'menu-item-icon')}<span>Redo</span
      >
    </button>
  </div>
{/if}
