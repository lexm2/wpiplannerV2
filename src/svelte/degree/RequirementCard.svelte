<script lang="ts">
  import type { AppliedCourse } from '../../types/degree';
  import type {
    DegreeBucket,
    DegreeTile,
  } from '../../services/degree/degreeBuckets';
  import { effectiveProgress } from '../../services/degree/requirementProgress';
  import {
    degreeState,
    isExpanded,
    toggleExpanded,
  } from './degreeState.svelte';
  import { degreeViewState } from './degreeViewState.svelte';
  import { degreeBucketService } from '../../services/degree/degreeBucketService';
  import { degreePlanService } from '../../services/degree/degreePlanService';
  import { academicYearForPeriod } from '../../services/degree/catalogLookup';
  import AssignMenu from './AssignMenu.svelte';
  import { courseDrag, draggableCourse } from './courseDrag.svelte';
  import { slideFade } from '../transitions';

  let { bucket }: { bucket: DegreeBucket } = $props();

  /**
   * Rows a collapsed card's body may hold, courses and the actions row alike.
   *
   * The cards sit in a CSS grid, and a grid row is as tall as its tallest card,
   * so one unbounded card wastes a whole row's height beside its neighbours.
   * A fixed row budget is what keeps every collapsed card exactly
   * --req-card-min-h tall, which is what makes the grid worth having. Keep this
   * and that custom property in step.
   */
  const COLLAPSED_ROWS = 3;

  /**
   * The full-bucket layout is "every card expanded" - it reuses this same
   * machinery rather than adding a second rendering path, so one place decides
   * what a card shows.
   */
  const expanded = $derived(
    degreeViewState.bucketView === 'full' || isExpanded(bucket.id),
  );
  /** In the full layout there is nothing to collapse to, so no toggle. */
  const collapsible = $derived(degreeViewState.bucketView === 'grid');

  // Completed/transfer courses stay fixed; the rest render as tiles.
  const fixedCourses = $derived(
    bucket.appliedCourses.filter(c => !c.isInProgress),
  );
  const tiles = $derived(degreeState.placements.get(bucket.id) ?? []);

  // Recomputed from the courses currently placed here.
  const progress = $derived(effectiveProgress(bucket, tiles));
  const satisfied = $derived(progress.status === 'satisfied');

  const statusLabel = $derived(
    satisfied
      ? 'Satisfied'
      : progress.status === 'in_progress'
        ? 'In progress'
        : 'Not satisfied',
  );

  const remainingLabel = $derived.by(() => {
    if (satisfied) return null;
    if (progress.creditsRemaining !== null)
      return `${progress.creditsRemaining} credits left`;
    if (progress.coursesRemaining !== null)
      return `${progress.coursesRemaining} course${progress.coursesRemaining === 1 ? '' : 's'} left`;
    return 'See requirement';
  });

  type Entry =
    | { key: string; tile: DegreeTile; course?: undefined }
    | { key: string; course: AppliedCourse; tile?: undefined };

  /**
   * Every course on this card, most-actionable first: schedule tiles the user
   * placed, then Workday's planned ones, then completed transcript courses.
   *
   * The order matters because a collapsed card only shows the first few. A
   * course just dropped into a full bucket has to land somewhere visible or the
   * drop looks like it failed - and completed courses need the least attention,
   * so they are the ones that give up their row.
   */
  const entries = $derived.by<Entry[]>(() => [
    ...tiles
      .filter(t => t.kind === 'schedule')
      .map(tile => ({ key: tile.key, tile })),
    ...tiles
      .filter(t => t.kind === 'planned')
      .map(tile => ({ key: tile.key, tile })),
    ...fixedCourses.map(course => ({
      key: course.code + (course.period?.raw ?? 'transfer'),
      course,
    })),
  ]);

  const emptyTiles = $derived(Array.from({ length: progress.emptySlots }));
  const needsBrowse = $derived(!satisfied && progress.emptySlots > 0);

  /**
   * How many courses a collapsed card wants to show.
   *
   * A satisfied bucket shows only the user's own placements, not its transcript
   * history - the full bar already says it is done. But it must never show
   * *nothing*: a course dropped into a bucket that the drop itself satisfies
   * would otherwise vanish behind "N courses · complete".
   */
  const wanted = $derived(
    satisfied
      ? tiles.filter(t => t.kind === 'schedule').length
      : entries.length,
  );

  /**
   * Row budget. The actions row costs one row whenever it appears, so the body
   * gives one up as soon as anything is hidden or a Browse affordance is due.
   * body rows + actions row <= COLLAPSED_ROWS is what keeps every collapsed
   * card exactly --req-card-min-h.
   */
  const roomWithoutActions = $derived(COLLAPSED_ROWS - (needsBrowse ? 1 : 0));
  const hidesSomething = $derived(
    wanted > roomWithoutActions || entries.length > wanted,
  );
  const capacity = $derived(
    hidesSomething ? COLLAPSED_ROWS - 1 : roomWithoutActions,
  );

  const shown = $derived(
    expanded ? entries : entries.slice(0, Math.min(capacity, wanted)),
  );
  const hiddenCount = $derived(entries.length - shown.length);

  const toggleLabel = $derived(
    expanded
      ? 'Show less'
      : satisfied && shown.length === 0
        ? `${entries.length} course${entries.length === 1 ? '' : 's'} · complete`
        : `+${hiddenCount} more`,
  );
  const canToggle = $derived(
    collapsible && (expanded ? entries.length > 0 : hiddenCount > 0),
  );

  // Highlighted while a dragged course hovers this card.
  const dragOver = $derived(
    courseDrag.courseId !== null && courseDrag.target === bucket.id,
  );
</script>

<article
  class="requirement-card req-{progress.status}"
  class:is-custom={bucket.source === 'custom'}
  class:is-expanded={expanded}
  class:drag-over={dragOver}
  data-bucket-id={bucket.id}
  role="group"
  aria-label={bucket.name}
>
  <header class="requirement-card-head">
    <h3 class="requirement-card-name" title={bucket.scope || undefined}>
      {bucket.name}
    </h3>
    <span class="req-status req-status-{progress.status}">{statusLabel}</span>
  </header>

  <!-- Always rendered, even with no numeric target (the segments are then all
       zero and only the hatched track shows): in a grid every card needs the
       same anatomy, or the rows read as accidental. -->
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

  {#if shown.length || (expanded && emptyTiles.length)}
    <div class="requirement-courses">
      {#each shown as entry (entry.key)}
        {#if entry.course}
          {@const course = entry.course}
          <div class="requirement-course" class:is-transfer={course.isTransfer}>
            <button
              type="button"
              class="requirement-course-code requirement-course-link"
              onclick={() =>
                degreePlanService.openCourse(
                  course.code,
                  academicYearForPeriod(course.period),
                )}>{course.code}</button
            >
            <span class="requirement-course-title">{course.title}</span>
            {#if course.isTransfer}
              <span class="course-badge course-badge-transfer">Transfer</span>
            {:else if course.grade}
              <span class="course-badge course-badge-grade">{course.grade}</span
              >
            {/if}
          </div>
        {:else if entry.tile}
          {@const tile = entry.tile}
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
            <button
              type="button"
              class="requirement-course-code requirement-course-link"
              onclick={e => {
                e.stopPropagation();
                degreePlanService.openCourse(tile.code, tile.year);
              }}>{tile.code}</button
            >
            <span class="requirement-course-title">{tile.title}</span>
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
            {:else}
              <span class="course-badge course-badge-progress">Planned</span>
            {/if}
          </div>
        {/if}
      {/each}

      {#if expanded}
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
      {/if}
    </div>
  {/if}

  {#if !expanded && (needsBrowse || canToggle)}
    <!-- One row for both actions, pinned to the card's foot. Collapsed, the
         ghost slots reduce to this single Browse button: up to twelve identical
         "Course needed" tiles used to dominate the card while repeating the
         credits-left label above them. -->
    <div class="requirement-card-actions">
      {#if canToggle}
        <button
          type="button"
          class="requirement-card-toggle"
          aria-expanded="false"
          onclick={() => toggleExpanded(bucket.id)}>{toggleLabel}</button
        >
      {/if}
      {#if needsBrowse}
        <button
          type="button"
          class="requirement-course-empty requirement-card-browse"
          onclick={() => degreePlanService.browseForBucket(bucket)}
        >
          <span class="requirement-course-empty-label"
            >Needs {progress.emptySlots} more</span
          >
          <span class="requirement-course-empty-hint"
            >Browse courses &rarr;</span
          >
        </button>
      {/if}
    </div>
  {/if}

  {#if expanded && canToggle}
    <button
      type="button"
      class="requirement-card-toggle requirement-card-less"
      aria-expanded="true"
      transition:slideFade={{ duration: 180 }}
      onclick={() => toggleExpanded(bucket.id)}>Show less</button
    >
  {/if}
</article>
