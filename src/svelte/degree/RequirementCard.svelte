<script lang="ts">
  import type { Requirement } from '../../types/degree';
  import { completionFraction } from '../../services/degree/requirementProgress';

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

  // Empty placeholder tiles for slots that still need a course. Course-count
  // requirements give an exact number; credit requirements are estimated at the
  // typical 3-credit course. Capped so large buckets don't render a huge grid.
  const EMPTY_CAP = 12;
  const emptySlots = $derived.by(() => {
    if (req.status === 'satisfied') return 0;
    if (req.coursesRemaining !== null) return Math.min(EMPTY_CAP, req.coursesRemaining);
    if (req.creditsRemaining !== null) return Math.min(EMPTY_CAP, Math.max(1, Math.ceil(req.creditsRemaining / 3)));
    return req.appliedCourses.length ? 0 : 1; // unknown (combination): show one cue
  });
  const emptyTiles = $derived(Array.from({ length: emptySlots }));
</script>

<article class="requirement-card" class:is-satisfied={req.status === 'satisfied'}>
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

  {#if req.appliedCourses.length || emptyTiles.length}
    <div class="requirement-courses">
      {#each req.appliedCourses as course (course.code + (course.period?.raw ?? 'transfer'))}
        <div
          class="requirement-course"
          class:is-progress={course.isInProgress}
          class:is-transfer={course.isTransfer}
        >
          <div class="requirement-course-top">
            <span class="requirement-course-code">{course.code}</span>
            {#if course.isTransfer}
              <span class="course-badge course-badge-transfer">Transfer</span>
            {:else if course.isInProgress}
              <span class="course-badge course-badge-progress">Planned</span>
            {:else if course.grade}
              <span class="course-badge course-badge-grade">{course.grade}</span>
            {/if}
          </div>
          <span class="requirement-course-title">{course.title}</span>
          {#if course.isInProgress && course.period}
            <span class="requirement-course-term">{course.period.raw}</span>
          {/if}
        </div>
      {/each}
      {#each emptyTiles as _, i (i)}
        <div class="requirement-course requirement-course-empty" aria-hidden="true">
          <span class="requirement-course-empty-label">Course needed</span>
        </div>
      {/each}
    </div>
  {/if}
</article>
