<script lang="ts">
  import {
    openDrawer,
    isDrawerOpen,
    type DrawerId,
  } from './drawerState.svelte';

  /**
   * Opens a side panel's drawer. CSS shows it only below that panel's
   * breakpoint (side-panel.css), so above it there is nothing to click. The
   * icon is a panel docked on the side the drawer slides from, or a list for
   * a drawer of items, which can also show how many it holds.
   */
  let {
    drawer,
    label,
    side,
    icon = 'panel',
    count,
  }: {
    drawer: DrawerId;
    label: string;
    side: 'left' | 'right';
    icon?: 'panel' | 'list';
    count?: number;
  } = $props();
</script>

<button
  type="button"
  class="filter-btn drawer-toggle drawer-toggle-{drawer}"
  aria-label={label}
  aria-expanded={isDrawerOpen(drawer)}
  title={count ? `${label} (${count})` : label}
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
    {#if icon === 'list'}
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <line x1="4" y1="6" x2="4.01" y2="6" />
      <line x1="4" y1="12" x2="4.01" y2="12" />
      <line x1="4" y1="18" x2="4.01" y2="18" />
    {:else}
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line
        x1={side === 'left' ? 9 : 15}
        y1="4"
        x2={side === 'left' ? 9 : 15}
        y2="20"
      />
    {/if}
  </svg>
  <span class="drawer-toggle-label">{label}</span>
  {#if count}
    <span class="drawer-toggle-count" aria-hidden="true">{count}</span>
  {/if}
</button>
