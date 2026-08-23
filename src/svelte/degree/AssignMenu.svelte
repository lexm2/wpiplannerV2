<script lang="ts">
  import { degreeState } from './degreeState.svelte';
  import { degreeBucketService } from '../../services/degree/degreeBucketService';
  import { scaleFade } from '../transitions';

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

  function choose(bucketId: string): void {
    open = false;
    if (bucketId !== currentBucketId) {
      degreeBucketService.assign(courseId, bucketId);
    }
  }
</script>

<svelte:window
  onclick={() => (open = false)}
  onkeydown={e => {
    if (e.key === 'Escape') open = false;
  }}
/>

<div class="assign-menu">
  <button
    type="button"
    class="assign-menu-trigger"
    aria-label={label}
    aria-expanded={open}
    title={label}
    onclick={e => {
      e.stopPropagation();
      open = !open;
    }}>Assign&hellip;</button
  >

  {#if open}
    <!-- Clicks inside must not reach the window handler that closes the menu. -->
    <div
      class="assign-menu-popup"
      role="menu"
      tabindex="-1"
      transition:scaleFade={{ duration: 150 }}
      onclick={e => e.stopPropagation()}
      onkeydown={e => e.stopPropagation()}
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
