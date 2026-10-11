<script lang="ts">
  import { scale } from 'svelte/transition';
  import { appState } from '../core/state/appState.svelte';
  import { uiState, setView } from '../services/ui/uiState.svelte';
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

  // The menu hangs from the gear: its corner meets the button's, a few px
  // off, and it grows out of that corner. At phone widths the gear sits in the
  // bottom bar (header.css), so there it opens upward instead.
  const GAP = 4;
  let anchor = $state({ top: 0, bottom: 0, right: 0, up: false });

  function place(): void {
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const up = r.top > window.innerHeight / 2;
    anchor = {
      top: r.bottom + GAP,
      bottom: window.innerHeight - r.top + GAP,
      right: window.innerWidth - r.right,
      up,
    };
  }

  function toggle(): void {
    if (!open) place();
    open = !open;
  }

  // appState.canUndo/canRedo are runes published by UndoRedoManager - the same
  // source the header UndoRedoButtons use - so the items' disabled state stays
  // in sync.
  const canUndo = $derived(appState.canUndo);
  const canRedo = $derived(appState.canRedo);

  // The Classes page's List/Grid switch. Its buttons give way to the search
  // field wherever that page's panels are drawers (main-content.css), so the
  // menu carries it too, offering whichever view is not showing.
  const onClasses = $derived(uiState.currentPage === 'planner');
  const otherView = $derived(uiState.currentView === 'list' ? 'grid' : 'list');

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

<svelte:window onkeydown={onKeydown} onresize={() => open && place()} />

<button
  id="settings-menu-btn"
  class="btn btn-icon settings-menu-btn"
  title="Settings"
  aria-label="Settings menu"
  aria-haspopup="true"
  aria-expanded={open}
  class:open
  bind:this={trigger}
  onclick={toggle}>{@html getInlineSVG('SETTINGS', 'settings-icon')}</button
>

{#if open}
  <div
    class="settings-dropdown-menu"
    class:up={anchor.up}
    id="settings-dropdown-menu"
    style:top={anchor.up ? 'auto' : `${anchor.top}px`}
    style:bottom={anchor.up ? `${anchor.bottom}px` : 'auto'}
    style:right="{anchor.right}px"
    transition:scale={{ start: 0.92, duration: dur(150) }}
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
    {#if onClasses}
      <button
        class="settings-menu-item"
        id="settings-view-btn"
        onclick={choose(() => setView(otherView))}
      >
        {@html getInlineSVG(
          otherView === 'grid' ? 'LAYOUT_GRID' : 'LAYOUT_LIST',
          'menu-item-icon',
        )}<span>{otherView === 'grid' ? 'Grid View' : 'List View'}</span>
      </button>
    {/if}
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
