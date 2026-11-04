<script lang="ts">
  import { scale } from 'svelte/transition';
  import { appState } from '../core/state/appState.svelte';
  import {
    uiState,
    setView,
    openModal,
    showAppError,
  } from '../services/ui/uiState.svelte';
  import { showConfirm } from './modals/modalState.svelte';
  import { tutorialsAvailable } from './phoneLayout.svelte';
  import { logger } from '../utils/logger';
  import type { ScheduleManagementService } from '../services/selection/ScheduleManagementService';
  import type { TutorialSetup } from '../services/tutorial/setupTutorial';
  import { getInlineSVG } from '../utils/iconPaths';
  import { dur } from './transitions';
  import { clickOutside } from './clickOutside';

  // The dropdown is position:fixed (anchored to the viewport), so rendering it
  // inside the header rather than in the body places it identically. Actions are
  // passed in so the undo/redo error handling + modal opening stay in App.svelte.
  // getTutorial is a thunk because services.tutorial is assigned after mount.
  let {
    scheduleManagementService,
    getTutorial,
    onSchedules,
    onToggleTheme,
    onUndo,
    onRedo,
  }: {
    scheduleManagementService: ScheduleManagementService;
    getTutorial: () => TutorialSetup | undefined;
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
  const EDGE = 8;
  let anchor = $state({
    top: 0,
    bottom: 0,
    right: 0,
    up: false,
    maxHeight: 0,
  });

  function place(): void {
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const up = r.top > window.innerHeight / 2;
    anchor = {
      top: r.bottom + GAP,
      bottom: window.innerHeight - r.top + GAP,
      right: window.innerWidth - r.right,
      up,
      maxHeight: (up ? r.top : window.innerHeight - r.bottom) - GAP - EDGE,
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

  function openTutorials(): void {
    if (getTutorial()) openModal('tutorials');
  }

  async function confirmClearAllData(): Promise<void> {
    try {
      await scheduleManagementService.clearAllSchedules();
    } catch (error) {
      logger.error('Failed to clear all data:', error);
      showAppError('Failed to clear all data. Please try again.');
    }
  }

  function clearAllData(): void {
    showConfirm({
      title: 'Clear all data',
      message:
        'Are you sure you want to clear ALL schedules and data?\n' +
        'This will delete all schedules, clear all selected courses and reset all preferences.\n' +
        'This action CANNOT be undone.',
      confirmLabel: 'Clear everything',
      variant: 'danger',
      onConfirm: () => {
        void confirmClearAllData();
      },
    });
  }

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
    style:max-height="{anchor.maxHeight}px"
    transition:scale={{ start: 0.92, duration: dur(150) }}
    use:clickOutside={{ onOutside: () => (open = false), ignore: trigger }}
  >
    <button
      class="settings-menu-item narrow-only"
      id="settings-schedules-btn"
      onclick={choose(onSchedules)}
    >
      {@html getInlineSVG('CALENDAR_UP', 'menu-item-icon')}<span>Schedules</span
      >
    </button>
    <button
      class="settings-menu-item narrow-only"
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
      class="settings-menu-item narrow-only"
      id="settings-undo-btn"
      disabled={!canUndo}
      onclick={choose(onUndo)}
    >
      {@html getInlineSVG('ARROW_BACK_UP', 'menu-item-icon')}<span>Undo</span>
    </button>
    <button
      class="settings-menu-item narrow-only"
      id="settings-redo-btn"
      disabled={!canRedo}
      onclick={choose(onRedo)}
    >
      {@html getInlineSVG('ARROW_FORWARD_UP', 'menu-item-icon')}<span>Redo</span
      >
    </button>
    <button
      class="settings-menu-item"
      id="changelog-btn"
      onclick={choose(() => openModal('changelog'))}
    >
      {@html getInlineSVG('CLOCK', 'menu-item-icon')}<span>What's New</span>
    </button>
    {#if getTutorial() && tutorialsAvailable()}
      <button
        class="settings-menu-item"
        id="tutorials-btn"
        onclick={choose(openTutorials)}
      >
        {@html getInlineSVG('CALENDAR_REPEAT', 'menu-item-icon')}<span
          >Tutorials</span
        >
      </button>
    {/if}
    <button
      class="settings-menu-item danger"
      id="clear-all-data-btn"
      onclick={choose(clearAllData)}
    >
      {@html getInlineSVG('TRASH', 'menu-item-icon')}<span>Clear All Data</span>
    </button>
  </div>
{/if}
