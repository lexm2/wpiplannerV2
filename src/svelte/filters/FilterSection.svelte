<script lang="ts">
  import type { Snippet } from 'svelte';

  // Shared shell for a filter panel section - the `filter-section` / header /
  // title / content markup that every section filter repeated verbatim. The
  // optional `actions` snippet renders in the header (e.g. a Clear button); the
  // body goes in `children`.
  let {
    title,
    actions,
    children,
  }: {
    title: string;
    actions?: Snippet;
    children: Snippet;
  } = $props();
</script>

<div class="filter-section">
  <div class="filter-section-header">
    <h4 class="filter-section-title">{title}</h4>
    {#if actions}<div class="filter-section-actions">
        {@render actions()}
      </div>{/if}
  </div>
  <div class="filter-section-content">
    {@render children()}
  </div>
</div>
