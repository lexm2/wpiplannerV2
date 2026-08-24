<script lang="ts">
  import Modal from './Modal.svelte';
  import { degreeState } from '../degree/degreeState.svelte';
  import { degreeViewState } from '../degree/degreeViewState.svelte';
  import { degreePlanService } from '../../services/degree/degreePlanService';
  import {
    COURSE_SORTS,
    groupCourses,
    matchesQuery,
    type CourseIndexEntry,
  } from '../../services/degree/courseIndex';
  import AssignMenu from '../degree/AssignMenu.svelte';

  /**
   * "Where did this course end up?" - the question the bucket cards cannot
   * answer, since a course can count toward several requirements at once and an
   * unplaced one appears in no card at all.
   *
   * A modal rather than a side panel: the panel cost the bucket grid a whole
   * column permanently to answer a question asked occasionally. Wide, because
   * the rows are short and a wide grid of them beats a long narrow list.
   */
  let { onRequestClose }: { onRequestClose: () => void } = $props();

  let query = $state('');
  let searchEl = $state<HTMLInputElement | null>(null);

  const sort = $derived(degreeViewState.courseSort);
  const sortLabel = $derived(
    COURSE_SORTS.find(s => s.key === sort)?.label ?? 'By source',
  );

  const matched = $derived(
    degreeState.courseIndex.filter(e => matchesQuery(e, query)),
  );
  const groups = $derived(groupCourses(matched, sort, degreeState.buckets));
  const total = $derived(degreeState.courseIndex.length);

  /**
   * Bucket names are shown per row except when the list is already grouped by
   * bucket - there the section heading says it, and repeating it is noise.
   */
  const showBuckets = $derived(sort !== 'bucket');

  /** Opening the course navigates to the planner, so the modal is done. */
  function open(entry: CourseIndexEntry): void {
    onRequestClose();
    degreePlanService.openCourse(entry.code, entry.year);
  }

  $effect(() => {
    searchEl?.focus();
  });
</script>

<Modal
  typeId="course-finder"
  title="Find a course"
  extraClass="course-finder-modal"
  {onRequestClose}
>
  {#snippet header(close)}
    <div class="modal-header course-finder-header">
      <h2 class="modal-title">Find a course</h2>
      <input
        type="search"
        class="course-finder-search"
        id="course-finder-search"
        placeholder="Course code, title, or bucket"
        aria-label="Search courses"
        bind:this={searchEl}
        bind:value={query}
      />
      <!-- One button stepping through the modes, rather than four chips: only
           the current mode is worth the space, and it is a rare control. -->
      <button
        type="button"
        class="course-finder-sort"
        id="course-finder-sort"
        title="Change how courses are grouped"
        onclick={() => degreeViewState.cycleSort()}
      >
        <span class="course-finder-sort-label">{sortLabel}</span>
        <span class="course-finder-sort-icon" aria-hidden="true">&#8645;</span>
      </button>
      <button class="modal-close" aria-label="Close" onclick={close}
        >&times;</button
      >
    </div>
  {/snippet}

  <div class="modal-body course-finder-body">
    {#if total === 0}
      <p class="empty-state">
        No courses yet. Import your academic progress, or add courses to your
        schedule.
      </p>
    {:else if groups.length === 0}
      <p class="empty-state">No course matches &ldquo;{query}&rdquo;.</p>
    {:else}
      {#each groups as group (group.key)}
        <section class="course-finder-group">
          <h3 class="course-finder-group-head">
            {group.label}
            <span class="course-finder-group-count">{group.entries.length}</span
            >
          </h3>
          <div class="course-finder-rows">
            {#each group.entries as entry (entry.key)}
              <div class="course-finder-row course-finder-row-{entry.source}">
                <div class="course-finder-row-top">
                  <button
                    type="button"
                    class="requirement-course-code requirement-course-link"
                    onclick={() => open(entry)}>{entry.code}</button
                  >
                  {#if entry.grade}
                    <span class="course-badge course-badge-grade"
                      >{entry.grade}</span
                    >
                  {/if}
                </div>
                <span class="course-finder-row-title">{entry.title}</span>
                {#if showBuckets}
                  <div class="course-finder-row-buckets">
                    {#if entry.buckets.length}
                      {#each entry.buckets as bucket (bucket.id)}
                        <span class="course-finder-bucket">{bucket.name}</span>
                      {/each}
                    {:else}
                      <span class="course-finder-bucket is-unplaced"
                        >Not in a bucket</span
                      >
                    {/if}
                  </div>
                {/if}
                {#if entry.courseId}
                  {@const courseId = entry.courseId}
                  <div class="course-finder-row-actions">
                    <AssignMenu
                      {courseId}
                      currentBucketId={entry.buckets[0]?.id}
                      label="Assign {entry.code} to a bucket"
                    />
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/each}
    {/if}
  </div>
</Modal>
