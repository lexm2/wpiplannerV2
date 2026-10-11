<script lang="ts">
  import {
    openDrawer,
    isDrawerOpen,
    type DrawerId,
  } from './drawerState.svelte';

  /**
   * Opens a side panel's drawer. CSS shows it only below that panel's
   * breakpoint (side-panel.css), so above it there is nothing to click. The
   * icon is a panel docked on the side the drawer slides from.
   */
  let {
    drawer,
    label,
    side,
  }: { drawer: DrawerId; label: string; side: 'left' | 'right' } = $props();
</script>

<button
  type="button"
  class="filter-btn drawer-toggle drawer-toggle-{drawer}"
  aria-label={label}
  aria-expanded={isDrawerOpen(drawer)}
  title={label}
  onclick={() => openDrawer(drawer)}
>
  <svg
    class="drawer-toggle-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line
      x1={side === 'left' ? 9 : 15}
      y1="4"
      x2={side === 'left' ? 9 : 15}
      y2="20"
    />
  </svg>
  <span class="drawer-toggle-label">{label}</span>
</button>
