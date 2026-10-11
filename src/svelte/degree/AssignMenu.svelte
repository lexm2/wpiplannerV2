<script lang="ts">
  import { degreeState } from './degreeState.svelte';
  import { degreeBucketService } from '../../services/degree/degreeBucketService';
  import { scaleFade } from '../transitions';
  import { clickOutside } from '../clickOutside';

  /** The click/keyboard path for placing a course, alongside dragging. */
  let {
    courseId,
    currentBucketId = null,
    label = 'Assign to bucket',
  }: {
    courseId: string;
    currentBucketId?: string | null;
    label?: string;
  } = $props();

  let open = $state(false);
  let trigger = $state<HTMLButtonElement | null>(null);

  function choose(bucketId: string): void {
    open = false;
    if (bucketId !== currentBucketId) {
      degreeBucketService.assign(courseId, bucketId);
    }
  }

  function closeAndRefocus(): void {
    open = false;
    trigger?.focus();
  }

  // Escape from anywhere closes it, but only an open menu listens - every tile
  // carries one of these.
  $effect(() => {
    if (!open) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') open = false;
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });
</script>

<div class="assign-menu">
  <button
    type="button"
    class="assign-menu-trigger"
    aria-label={label}
    aria-expanded={open}
    title={label}
    bind:this={trigger}
    onclick={() => (open = !open)}
    onkeydown={e => {
      if (e.key === 'Escape' && open) {
        e.stopPropagation();
        closeAndRefocus();
      }
    }}>Assign&hellip;</button
  >

  {#if open}
    <div
      class="assign-menu-popup"
      role="menu"
      tabindex="-1"
      transition:scaleFade={{ duration: 150 }}
      use:clickOutside={{ onOutside: () => (open = false), ignore: trigger }}
      onkeydown={e => {
        // Keys stay inside the menu, so Escape has to be handled here.
        e.stopPropagation();
        if (e.key === 'Escape') closeAndRefocus();
      }}
    >
      {#each degreeState.buckets as bucket (bucket.id)}
        <button
          type="button"
          class="assign-menu-item"
          class:is-current={bucket.id === currentBucketId}
          role="menuitem"
          onclick={() => choose(bucket.id)}
        >
          {bucket.name}
        </button>
      {:else}
        <p class="assign-menu-empty">No buckets yet.</p>
      {/each}
    </div>
  {/if}
</div>
