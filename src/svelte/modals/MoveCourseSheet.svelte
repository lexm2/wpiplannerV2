<script lang="ts">
  import Modal from './Modal.svelte';
  import { degreeState, placeableBuckets } from '../degree/degreeState.svelte';
  import { degreeBucketService } from '../../services/degree/degreeBucketService';
  import { degreePlanService } from '../../services/degree/degreePlanService';
  import { remainingLabel, statusLabel } from '../degree/progressLabels';

  /**
   * Placing a course on a phone. Touch can't drag a course (a finger on one
   * scrolls the page), and the Assign popup had no room to open, so tapping a
   * course opens this sheet instead: every bucket it could go in, each with
   * the progress it would feed, plus taking it back out and its catalog entry.
   */
  let { onRequestClose }: { onRequestClose: () => void } = $props();

  const courseId = $derived(degreeState.moving);
  const entry = $derived(
    courseId
      ? degreeState.courseIndex.find(e => e.courseId === courseId)
      : undefined,
  );
  const current = $derived(
    courseId ? (degreeState.config.assignments[courseId] ?? null) : null,
  );

  const buckets = $derived(placeableBuckets(current));

  function place(bucketId: string): void {
    onRequestClose();
    if (courseId && bucketId !== current)
      degreeBucketService.assign(courseId, bucketId);
  }

  function remove(): void {
    onRequestClose();
    if (courseId) degreeBucketService.unassign(courseId);
  }

  function details(): void {
    onRequestClose();
    if (entry) degreePlanService.openCourse(entry.code, entry.year);
  }
</script>

<Modal
  typeId="move-course"
  title={entry ? `Place ${entry.code}` : 'Place course'}
  extraClass="move-sheet-modal"
  dialogClass="move-sheet"
  {onRequestClose}
>
  {#snippet header(close)}
    <div class="modal-header move-sheet-header">
      <div class="move-sheet-course">
        <span class="requirement-course-code">{entry?.code}</span>
        <span class="move-sheet-title">{entry?.title}</span>
      </div>
      <button class="modal-close" aria-label="Close" onclick={close}
        >&times;</button
      >
    </div>
  {/snippet}

  <div class="move-sheet-body">
    <h3 class="move-sheet-label">{current ? 'Move to' : 'Place in'}</h3>
    <div class="move-sheet-buckets">
      {#each buckets as bucket (bucket.id)}
        {@const progress = degreeState.progressById.get(bucket.id)}
        {@const here = bucket.id === current}
        <button
          type="button"
          class="move-sheet-bucket req-{progress?.status ?? bucket.status}"
          class:is-current={here}
          disabled={here}
          aria-current={here ? 'true' : undefined}
          onclick={() => place(bucket.id)}
        >
          <span class="move-sheet-bucket-name">{bucket.name}</span>
          <span class="move-sheet-bucket-meta">
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
        <p class="empty-state">No buckets yet.</p>
      {/each}
    </div>
  </div>

  <div class="move-sheet-actions">
    {#if current}
      <button
        type="button"
        class="btn btn-secondary move-sheet-remove"
        onclick={remove}>Remove from bucket</button
      >
    {/if}
    <button type="button" class="btn btn-secondary" onclick={details}
      >Course details</button
    >
  </div>
</Modal>
