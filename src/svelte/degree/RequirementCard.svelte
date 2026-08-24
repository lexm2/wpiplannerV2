<script lang="ts">
  import type { DegreeBucket } from '../../services/degree/degreeBuckets';
  import { effectiveProgress } from '../../services/degree/requirementProgress';
  import { degreeState } from './degreeState.svelte';
  import { degreeBucketService } from '../../services/degree/degreeBucketService';
  import { degreePlanService } from '../../services/degree/degreePlanService';
  import { academicYearForPeriod } from '../../services/degree/catalogLookup';
  import AssignMenu from './AssignMenu.svelte';
  import { courseDrag, draggableCourse } from './courseDrag.svelte';

  let { bucket }: { bucket: DegreeBucket } = $props();

  // Completed/transfer courses stay fixed; the rest render as tiles.
  const fixedCourses = $derived(
    bucket.appliedCourses.filter(c => !c.isInProgress),
  );
  const tiles = $derived(degreeState.placements.get(bucket.id) ?? []);

  // Recomputed from the courses currently placed here.
  const progress = $derived(effectiveProgress(bucket, tiles));
  const pct = $derived(
    progress.fraction === null ? null : Math.round(progress.fraction * 100),
  );

  const statusLabel = $derived(
    progress.status === 'satisfied'
      ? 'Satisfied'
      : progress.status === 'in_progress'
        ? 'In progress'
        : 'Not satisfied',
  );

  const remainingLabel = $derived.by(() => {
    if (progress.status === 'satisfied') return null;
    if (progress.creditsRemaining !== null)
      return `${progress.creditsRemaining} credits left`;
    if (progress.coursesRemaining !== null)
      return `${progress.coursesRemaining} course${progress.coursesRemaining === 1 ? '' : 's'} left`;
    return 'See requirement';
  });

  const emptyTiles = $derived(Array.from({ length: progress.emptySlots }));

  // Highlighted while a dragged course hovers this card.
  const dragOver = $derived(
    courseDrag.courseId !== null && courseDrag.target === bucket.id,
  );
</script>

<article
  class="requirement-card"
  class:is-satisfied={progress.status === 'satisfied'}
  class:drag-over={dragOver}
  data-bucket-id={bucket.id}
  role="group"
>
  <header class="requirement-card-head">
    <div class="requirement-card-titles">
      <h3 class="requirement-card-name">{bucket.name}</h3>
      {#if bucket.scope}<span class="requirement-card-scope"
          >{bucket.scope}</span
        >{/if}
      {#if bucket.source === 'custom'}
        <span class="requirement-card-scope">Custom</span>
      {/if}
    </div>
    <span class="req-status req-status-{progress.status}">{statusLabel}</span>
  </header>

  {#if pct !== null}
    <div class="degree-progress degree-progress-sm">
      <div class="degree-progress-bar">
        <div
          class="degree-progress-seg seg-earned"
          style:width="{progress.segments.earned * 100}%"
        ></div>
        <div
          class="degree-progress-seg seg-planned"
          style:width="{progress.segments.planned * 100}%"
        ></div>
        <div
          class="degree-progress-seg seg-schedule"
          style:width="{progress.segments.schedule * 100}%"
        ></div>
      </div>
      {#if remainingLabel}<span class="degree-progress-label"
          >{remainingLabel}</span
        >{/if}
    </div>
  {:else if remainingLabel}
    <p class="requirement-card-remaining">{remainingLabel}</p>
  {/if}

  {#if fixedCourses.length || tiles.length || emptyTiles.length}
    <div class="requirement-courses">
      {#each fixedCourses as course (course.code + (course.period?.raw ?? 'transfer'))}
        <div class="requirement-course" class:is-transfer={course.isTransfer}>
          <div class="requirement-course-top">
            <button
              type="button"
              class="requirement-course-code requirement-course-link"
              onclick={() =>
                degreePlanService.openCourse(
                  course.code,
                  academicYearForPeriod(course.period),
                )}>{course.code}</button
            >
            {#if course.isTransfer}
              <span class="course-badge course-badge-transfer">Transfer</span>
            {:else if course.grade}
              <span class="course-badge course-badge-grade">{course.grade}</span
              >
            {/if}
          </div>
          <span class="requirement-course-title">{course.title}</span>
        </div>
      {/each}

      {#each tiles as tile (tile.key)}
        <!-- Only schedule tiles are movable; Workday's planned courses stay put. -->
        {@const movable =
          tile.kind === 'schedule' && tile.courseId
            ? {
                role: 'button',
                tabindex: 0,
                title: 'Drag to another bucket, or use the Assign menu',
              }
            : {}}
        <div
          class="requirement-course"
          class:is-progress={tile.kind === 'planned'}
          class:is-schedule={tile.kind === 'schedule'}
          class:requirement-course-draggable={tile.kind === 'schedule'}
          data-course-id={tile.courseId}
          use:draggableCourse={{ courseId: tile.courseId, from: bucket.id }}
          {...movable}
        >
          <div class="requirement-course-top">
            <button
              type="button"
              class="requirement-course-code requirement-course-link"
              onclick={e => {
                e.stopPropagation();
                degreePlanService.openCourse(tile.code, tile.year);
              }}>{tile.code}</button
            >
            <span
              class="course-badge"
              class:course-badge-progress={tile.kind === 'planned'}
              class:course-badge-schedule={tile.kind === 'schedule'}
              >{tile.kind === 'planned' ? 'Planned' : 'Schedule'}</span
            >
          </div>
          <span class="requirement-course-title">{tile.title}</span>
          {#if tile.term}<span class="requirement-course-term">{tile.term}</span
            >{/if}
          {#if tile.kind === 'schedule' && tile.courseId}
            {@const courseId = tile.courseId}
            <div class="requirement-course-actions">
              <AssignMenu
                {courseId}
                currentBucketId={bucket.id}
                label="Move {tile.code}"
              />
              <button
                type="button"
                class="requirement-course-remove"
                title="Remove from this bucket"
                aria-label="Remove {tile.code} from {bucket.name}"
                onclick={() => degreeBucketService.unassign(courseId)}
                >&times;</button
              >
            </div>
          {/if}
        </div>
      {/each}

      {#each emptyTiles as _, i (i)}
        <button
          type="button"
          class="requirement-course requirement-course-empty"
          onclick={() => degreePlanService.browseForBucket(bucket)}
        >
          <span class="requirement-course-empty-label">Course needed</span>
          <span class="requirement-course-empty-hint"
            >Browse courses &rarr;</span
          >
        </button>
      {/each}
    </div>
  {/if}
</article>
