<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getInlineSVG } from '../../utils/iconPaths';
  import { slideFade } from '../transitions';
  import { isOpen, setOpen } from './disclosureState.svelte';

  let {
    id,
    label,
    activeCount = 0,
    children,
  }: {
    /** Stable key the open state is remembered under. */
    id: string;
    label: string;
    /** How many of the hidden options are set; shown so a collapsed section
     * never hides an active setting. */
    activeCount?: number;
    children: Snippet;
  } = $props();

  const open = $derived(isOpen(id));
</script>

<div class="more-section">
  <button
    type="button"
    class="more-section-toggle"
    class:open
    id="{id}-toggle"
    aria-expanded={open}
    aria-controls="{id}-body"
    onclick={() => setOpen(id, !open)}
  >
    <span class="more-section-label">{label}</span>
    {#if activeCount > 0}
      <span class="more-section-badge">{activeCount} active</span>
    {/if}
    <span class="chevron-icon more-section-chevron" aria-hidden="true"
      >{@html getInlineSVG('CHEVRON_DOWN')}</span
    >
  </button>
  {#if open}
    <div
      class="more-section-body"
      id="{id}-body"
      transition:slideFade={{ duration: 200 }}
    >
      {@render children()}
    </div>
  {/if}
</div>
