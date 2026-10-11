<script lang="ts">
  import { fly } from 'svelte/transition';
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import { dur } from './transitions';
  import { clickOutside } from './clickOutside';

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
  let trigger = $state<HTMLButtonElement | null>(null);

  // At phone widths the gear sits in the bottom bar (header.css), so the menu
  // opens upward and rises into place instead of dropping down.
  const bottomBar = window.matchMedia('(max-width: 560px)');

  // appState.canUndo/canRedo are runes published by UndoRedoManager - the same
  // source the header UndoRedoButtons use - so the items' disabled state stays
  // in sync.
  const canUndo = $derived(appState.canUndo);
  const canRedo = $derived(appState.canRedo);

  // Each item closes the menu as it runs; clicks anywhere else close it via
  // clickOutside.
  function choose(action: () => void): () => void {
    return () => {
      open = false;
      action();
    };
  }

  function onKeydown(e: KeyboardEvent): void {
    // Only while open, so Escape still reaches modals and the wizard otherwise.
    if (!open || e.key !== 'Escape') return;
    e.preventDefault();
    open = false;
    trigger?.focus();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<button
  id="settings-menu-btn"
  class="btn btn-icon settings-menu-btn"
  title="Settings"
  aria-label="Settings menu"
  aria-haspopup="true"
  aria-expanded={open}
  bind:this={trigger}
  onclick={() => (open = !open)}
  >{@html getInlineSVG('SETTINGS', 'settings-icon')}</button
>

{#if open}
  <div
    class="settings-dropdown-menu"
    id="settings-dropdown-menu"
    transition:fly={{ y: bottomBar.matches ? 10 : -10, duration: dur(200) }}
    use:clickOutside={{ onOutside: () => (open = false), ignore: trigger }}
  >
    <button class="settings-menu-item" onclick={choose(onSchedules)}>
      {@html getInlineSVG('CALENDAR_UP', 'menu-item-icon')}<span>Schedules</span
      >
    </button>
    <button
      class="settings-menu-item"
      id="settings-theme-btn"
      onclick={choose(onToggleTheme)}
    >
      {@html getInlineSVG('BRIGHTNESS', 'menu-item-icon')}<span
        >Toggle Theme</span
      >
    </button>
    <button
      class="settings-menu-item"
      id="settings-undo-btn"
      disabled={!canUndo}
      onclick={choose(onUndo)}
    >
      {@html getInlineSVG('ARROW_BACK_UP', 'menu-item-icon')}<span>Undo</span>
    </button>
    <button
      class="settings-menu-item"
      id="settings-redo-btn"
      disabled={!canRedo}
      onclick={choose(onRedo)}
    >
      {@html getInlineSVG('ARROW_FORWARD_UP', 'menu-item-icon')}<span>Redo</span
      >
    </button>
  </div>
{/if}
