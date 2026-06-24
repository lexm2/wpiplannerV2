<script lang="ts">
  import type { Requirement } from '../../types/degree';
  import { completionFraction } from '../../services/degree/requirementProgress';
  import { degreeState } from './degreeState.svelte';
  import { degreePlanService } from '../../services/degree/degreePlanService';
  import { academicYearForPeriod } from '../../services/degree/catalogLookup';
  import { startDragAutoScroll, stopDragAutoScroll } from './dragAutoScroll';

  let { req }: { req: Requirement } = $props();

  const pct = $derived.by(() => {
    const f = completionFraction(req);
    return f === null ? null : Math.round(f * 100);
  });

  const statusLabel = $derived(
    req.status === 'satisfied' ? 'Satisfied' : req.status === 'in_progress' ? 'In progress' : 'Not satisfied'
  );

  const remainingLabel = $derived.by(() => {
    if (req.status === 'satisfied') return null;
    if (req.creditsRemaining !== null) return `${req.creditsRemaining} credits left`;
    if (req.coursesRemaining !== null) return `${req.coursesRemaining} course${req.coursesRemaining === 1 ? '' : 's'} left`;
    return 'See requirement';
  });

  // Completed/transfer courses stay fixed; planned (in-progress) + schedule
  // overlay courses are the draggable tiles, sourced from degreeState.placements.
  const fixedCourses = $derived(req.appliedCourses.filter(c => !c.isInProgress));
  const tiles = $derived(degreeState.placements.get(req.rawName) ?? []);
  const scheduleHere = $derived(tiles.filter(t => t.kind === 'schedule').length);

  // Empty placeholder tiles for slots that still need a course. Course-count
  // requirements give an exact number; credit requirements are estimated at the
  // typical 3-credit course. Schedule-overlay tiles fill some slots. Capped so
  // large buckets don't render a huge grid.
  const EMPTY_CAP = 12;
  const baseEmpty = $derived.by(() => {
    if (req.status === 'satisfied') return 0;
    if (req.coursesRemaining !== null) return Math.min(EMPTY_CAP, req.coursesRemaining);
    if (req.creditsRemaining !== null) return Math.min(EMPTY_CAP, Math.max(1, Math.ceil(req.creditsRemaining / 3)));
    return req.appliedCourses.length ? 0 : 1; // unknown (combination): show one cue
  });
  const emptySlots = $derived(Math.max(0, baseEmpty - scheduleHere));
  const emptyTiles = $derived(Array.from({ length: emptySlots }));

  let dragOver = $state(false);

  function badgeFor(kind: string, confidence: string | null): string {
    if (kind === 'planned') return 'Planned';
    if (confidence === 'manual') return 'Moved';
    return confidence === 'exact' ? 'Schedule' : 'Likely';
  }

  function onDragStart(e: DragEvent, key: string): void {
    e.dataTransfer?.setData('text/plain', key);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    startDragAutoScroll();
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault();
    dragOver = false;
    stopDragAutoScroll();
    const key = e.dataTransfer?.getData('text/plain');
    if (key) degreeState.reassign(key, req.rawName);
  }
</script>

<article
  class="requirement-card"
  class:is-satisfied={req.status === 'satisfied'}
  class:drag-over={dragOver}
  ondragover={(e) => { e.preventDefault(); dragOver = true; }}
  ondragleave={() => (dragOver = false)}
  ondrop={onDrop}
  role="group"
>
  <header class="requirement-card-head">
    <div class="requirement-card-titles">
      <h3 class="requirement-card-name">{req.name}</h3>
      {#if req.scope}<span class="requirement-card-scope">{req.scope}</span>{/if}
    </div>
    <span class="req-status req-status-{req.status}">{statusLabel}</span>
  </header>

  {#if pct !== null}
    <div class="degree-progress degree-progress-sm">
      <div class="degree-progress-bar"><div class="degree-progress-fill" style:width="{pct}%"></div></div>
      {#if remainingLabel}<span class="degree-progress-label">{remainingLabel}</span>{/if}
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
              onclick={() => degreePlanService.openCourse(course.code, academicYearForPeriod(course.period))}
            >{course.code}</button>
            {#if course.isTransfer}
              <span class="course-badge course-badge-transfer">Transfer</span>
            {:else if course.grade}
              <span class="course-badge course-badge-grade">{course.grade}</span>
            {/if}
          </div>
          <span class="requirement-course-title">{course.title}</span>
        </div>
      {/each}

      {#each tiles as tile (tile.key)}
        <div
          class="requirement-course requirement-course-draggable"
          class:is-progress={tile.kind === 'planned'}
          class:is-schedule={tile.kind === 'schedule'}
          class:is-tentative={tile.confidence === 'heuristic'}
          draggable="true"
          ondragstart={(e) => onDragStart(e, tile.key)}
          ondragend={stopDragAutoScroll}
          role="button"
          tabindex="0"
          title="Drag to another requirement to re-bucket"
        >
          <div class="requirement-course-top">
            <button
              type="button"
              class="requirement-course-code requirement-course-link"
              onclick={(e) => { e.stopPropagation(); degreePlanService.openCourse(tile.code, tile.year); }}
            >{tile.code}</button>
            <span
              class="course-badge"
              class:course-badge-progress={tile.kind === 'planned'}
              class:course-badge-schedule={tile.kind === 'schedule'}
            >{badgeFor(tile.kind, tile.confidence)}</span>
          </div>
          <span class="requirement-course-title">{tile.title}</span>
          {#if tile.term}<span class="requirement-course-term">{tile.term}</span>{/if}
        </div>
      {/each}

      {#each emptyTiles as _, i (i)}
        <button
          type="button"
          class="requirement-course requirement-course-empty"
          onclick={() => degreePlanService.browseForRequirement(req)}
        >
          <span class="requirement-course-empty-label">Course needed</span>
          <span class="requirement-course-empty-hint">Browse courses →</span>
        </button>
      {/each}
    </div>
  {/if}
</article>
