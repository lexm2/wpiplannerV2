<script lang="ts">
  import {
    degreeState,
    openMoveSheet,
    placeableBuckets,
  } from './degreeState.svelte';
  import { degreeBucketService } from '../../services/degree/degreeBucketService';
  import { placesBySheet } from '../phoneLayout.svelte';
  import { remainingLabel, statusLabel } from './progressLabels';
  import { scaleFade } from '../transitions';
  import { clickOutside } from '../clickOutside';

  /** The click/keyboard path for placing a course, alongside dragging. On a
   * phone or a touch screen it opens the Move sheet instead (MoveCourseSheet),
   * since touch can't drag. */
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
  /** Opens upward from the trigger, unless there is no room above it. */
  let down = $state(false);

  // The same buckets the Move sheet offers, each with the progress it would
  // feed - so the menu says where a course does the most good.
  const buckets = $derived(placeableBuckets(currentBucketId));

  /** The popup's tallest (its max-height), plus the gap to the trigger. */
  const POPUP_ROOM = 15 * 16 + 8;

  function onTrigger(): void {
    if (placesBySheet()) {
      openMoveSheet(courseId);
      return;
    }
    if (!open && trigger) {
      // Room above, measured from where the popup hangs (a rail course's
      // own top edge, else the button) to the top of whatever scrolls it:
      // a Degree page pane, or the course finder's body.
      const anchor =
        trigger.closest<HTMLElement>('.degree-rail .requirement-course') ??
        trigger;
      const paneTop =
        trigger.closest('.degree-pane, .modal-body')?.getBoundingClientRect()
          .top ?? 0;
      down = anchor.getBoundingClientRect().top - paneTop < POPUP_ROOM;
    }
    open = !open;
  }

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
    onclick={onTrigger}
    onkeydown={e => {
      if (e.key === 'Escape' && open) {
        e.stopPropagation();
        closeAndRefocus();
      }
    }}>Assign</button
  >

  {#if open}
    <div
      class="assign-menu-popup"
      class:opens-down={down}
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
      {#each buckets as bucket (bucket.id)}
        {@const progress = degreeState.progressById.get(bucket.id)}
        {@const here = bucket.id === currentBucketId}
        <button
          type="button"
          class="assign-menu-item assign-menu-bucket req-{progress?.status ??
            bucket.status}"
          class:is-current={here}
          role="menuitem"
          aria-current={here ? 'true' : undefined}
          onclick={() => choose(bucket.id)}
        >
          <span class="assign-menu-bucket-name">{bucket.name}</span>
          <span class="assign-menu-bucket-meta">
            {#if here}
              Here now
            {:else if progress}
              {remainingLabel(progress) ?? statusLabel(progress)}
            {/if}
          </span>
          {#if progress}
            <span class="degree-progress-bar" aria-hidden="true">
              <span
                class="degree-progress-seg seg-earned"
                style:width="{progress.segments.earned * 100}%"
              ></span>
              <span
                class="degree-progress-seg seg-planned"
                style:width="{progress.segments.planned * 100}%"
              ></span>
              <span
                class="degree-progress-seg seg-schedule"
                style:width="{progress.segments.schedule * 100}%"
              ></span>
            </span>
          {/if}
        </button>
      {:else}
        <p class="assign-menu-empty">No buckets yet.</p>
      {/each}
    </div>
  {/if}
</div>
