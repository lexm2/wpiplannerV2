<script lang="ts">
  import { scale } from 'svelte/transition';
  import { tick } from 'svelte';
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
  import { menuKeys, focusMenuItem, openingKey } from './menuKeys';
  import { ThemeManager } from '../themes/ThemeManager';

  // The dropdown is position:fixed (anchored to the viewport), so rendering it
  // inside the header rather than in the body places it identically. Actions are
  // passed in so the undo/redo error handling + modal opening stay in App.svelte.
  // getTutorial is a thunk because services.tutorial is assigned after mount.
  let {
    scheduleManagementService,
    getTutorial,
    onSchedules,
    onUndo,
    onRedo,
  }: {
    scheduleManagementService: ScheduleManagementService;
    getTutorial: () => TutorialSetup | undefined;
    onSchedules: () => void;
    onUndo: () => void;
    onRedo: () => void;
  } = $props();

  // The header's theme dropdown is hidden below 1250px, so the menu offers the
  // same choice there.
  const themeManager = ThemeManager.getInstance();
  const themes = themeManager.getAvailableThemes();
  const currentThemeId = $derived(uiState.currentThemeId);

  let open = $state(false);
  let menuEl = $state<HTMLElement | null>(null);
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

  // Opens with focus on an item when the trigger was operated by keyboard
  // (a click from Enter or Space has no pointer, so detail is 0); a mouse
  // click leaves focus where it is.
  async function openMenu(focus: 'first' | 'last' | null): Promise<void> {
    place();
    open = true;
    if (!focus) return;
    await tick();
    focusMenuItem(menuEl, focus);
  }

  function toggle(e: MouseEvent): void {
    if (open) open = false;
    else void openMenu(e.detail === 0 ? 'first' : null);
  }

  function onTriggerKeydown(e: KeyboardEvent): void {
    const which = openingKey(e);
    if (!which) return;
    e.preventDefault();
    if (open) focusMenuItem(menuEl, which);
    else void openMenu(which);
  }

  // appState.canUndo/canRedo are runes published by UndoRedoManager - the same
  // source the header UndoRedoButtons use - so the items' disabled state stays
  // in sync.
  const canUndo = $derived(appState.canUndo);
  const canRedo = $derived(appState.canRedo);

  // The Classes page's only List/Grid switch, offering whichever view is not
  // showing.
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
  // clickOutside. Focus goes back to the gear first: the item is about to be
  // removed, and a dialog the action opens restores focus to whatever held it.
  function choose(action: () => void): () => void {
    return () => {
      trigger?.focus();
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
  aria-haspopup="menu"
  aria-expanded={open}
  aria-controls={open ? 'settings-dropdown-menu' : undefined}
  class:open
  bind:this={trigger}
  onkeydown={onTriggerKeydown}
  onclick={toggle}>{@html getInlineSVG('SETTINGS', 'settings-icon')}</button
>

{#if open}
  <div
    class="settings-dropdown-menu"
    class:up={anchor.up}
    id="settings-dropdown-menu"
    role="menu"
    aria-label="Settings"
    bind:this={menuEl}
    style:top={anchor.up ? 'auto' : `${anchor.top}px`}
    style:bottom={anchor.up ? `${anchor.bottom}px` : 'auto'}
    style:right="{anchor.right}px"
    style:max-height="{anchor.maxHeight}px"
    transition:scale={{ start: 0.92, duration: dur(150) }}
    use:clickOutside={{ onOutside: () => (open = false), ignore: trigger }}
    use:menuKeys={{ trigger, onClose: () => (open = false) }}
  >
    <button
      class="settings-menu-item narrow-only"
      role="menuitem"
      id="settings-schedules-btn"
      onclick={choose(onSchedules)}
    >
      {@html getInlineSVG('CALENDAR_UP', 'menu-item-icon')}<span>Schedules</span
      >
    </button>
    <div
      class="settings-menu-group narrow-only"
      role="group"
      aria-labelledby="settings-theme-label"
    >
      <div class="settings-menu-label" id="settings-theme-label">Theme</div>
      {#each themes as t (t.id)}
        <button
          class="settings-menu-item"
          id="settings-theme-{t.id}"
          role="menuitemradio"
          aria-checked={t.id === currentThemeId}
          onclick={choose(() => themeManager.setTheme(t.id))}
        >
          <span
            class="menu-item-check"
            class:checked={t.id === currentThemeId}
            aria-hidden="true"
            >{@html getInlineSVG('CHECK', 'menu-item-icon')}</span
          ><span>{t.name}</span>
        </button>
      {/each}
    </div>
    {#if onClasses}
      <button
        class="settings-menu-item"
        role="menuitem"
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
      role="menuitem"
      id="settings-undo-btn"
      disabled={!canUndo}
      onclick={choose(onUndo)}
    >
      {@html getInlineSVG('ARROW_BACK_UP', 'menu-item-icon')}<span>Undo</span>
    </button>
    <button
      class="settings-menu-item narrow-only"
      role="menuitem"
      id="settings-redo-btn"
      disabled={!canRedo}
      onclick={choose(onRedo)}
    >
      {@html getInlineSVG('ARROW_FORWARD_UP', 'menu-item-icon')}<span>Redo</span
      >
    </button>
    <button
      class="settings-menu-item"
      role="menuitem"
      id="changelog-btn"
      onclick={choose(() => openModal('changelog'))}
    >
      {@html getInlineSVG('CLOCK', 'menu-item-icon')}<span>What's New</span>
    </button>
    {#if getTutorial() && tutorialsAvailable()}
      <button
        class="settings-menu-item"
        role="menuitem"
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
      role="menuitem"
      id="clear-all-data-btn"
      onclick={choose(clearAllData)}
    >
      {@html getInlineSVG('TRASH', 'menu-item-icon')}<span>Clear All Data</span>
    </button>
  </div>
{/if}
