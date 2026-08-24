<script lang="ts">
  import { degreeState } from './degreeState.svelte';
  import { degreeViewState } from './degreeViewState.svelte';
  import { degreePlanService } from '../../services/degree/degreePlanService';
  import {
    COURSE_SORTS,
    groupCourses,
    matchesQuery,
    type CourseIndexEntry,
  } from '../../services/degree/courseIndex';
  import AssignMenu from './AssignMenu.svelte';

  let query = $state('');

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
   * bucket - there the section heading says it, and repeating it on every row
   * is noise.
   */
  const showBuckets = $derived(sort !== 'bucket');

  function open(entry: CourseIndexEntry): void {
    degreePlanService.openCourse(entry.code, entry.year);
  }
</script>

<div class="degree-finder-inner">
  <header class="degree-finder-head">
    <h2 class="degree-rail-title">Find a course</h2>
    <button
      type="button"
      class="degree-finder-close"
      aria-label="Close the course finder"
      onclick={() => degreeViewState.toggleFinder()}>&times;</button
    >
  </header>

  <div class="degree-finder-controls">
    <input
      type="search"
      class="degree-finder-search"
      id="degree-finder-search"
      placeholder="Course code, title, or bucket"
      aria-label="Search courses"
      bind:value={query}
    />
    <!-- One button that steps through the modes, rather than four radio-ish
         chips: the panel is narrow, and the current mode is the only one worth
         showing. -->
    <button
      type="button"
      class="degree-finder-sort"
      id="degree-finder-sort"
      title="Change how courses are grouped"
      onclick={() => degreeViewState.cycleSort()}
    >
      <span class="degree-finder-sort-label">{sortLabel}</span>
      <span class="degree-finder-sort-icon" aria-hidden="true">⇅</span>
    </button>
  </div>

  {#if total === 0}
    <p class="empty-state">
      No courses yet. Import your academic progress, or add courses to your
      schedule.
    </p>
  {:else if groups.length === 0}
    <p class="empty-state">No course matches &ldquo;{query}&rdquo;.</p>
  {:else}
    <div class="degree-finder-groups">
      {#each groups as group (group.key)}
        <section class="degree-finder-group">
          <h3 class="degree-finder-group-head">
            {group.label}
            <span class="degree-finder-group-count">{group.entries.length}</span
            >
          </h3>
          {#each group.entries as entry (entry.key)}
            <!-- No per-row transition: rows leave on every keystroke while
                 filtering, and an outro keeps them in the flow for its whole
                 duration - the list would visibly trail the query. -->
            <div class="degree-finder-row degree-finder-row-{entry.source}">
              <div class="degree-finder-row-top">
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
              <span class="degree-finder-row-title">{entry.title}</span>
              {#if showBuckets}
                <div class="degree-finder-row-buckets">
                  {#if entry.buckets.length}
                    {#each entry.buckets as bucket (bucket.id)}
                      <span class="degree-finder-bucket">{bucket.name}</span>
                    {/each}
                  {:else}
                    <span class="degree-finder-bucket is-unplaced"
                      >Not in a bucket</span
                    >
                  {/if}
                </div>
              {/if}
              {#if entry.courseId}
                {@const courseId = entry.courseId}
                <div class="degree-finder-row-actions">
                  <AssignMenu
                    {courseId}
                    currentBucketId={entry.buckets[0]?.id}
                    label="Assign {entry.code} to a bucket"
                  />
                </div>
              {/if}
            </div>
          {/each}
        </section>
      {/each}
    </div>
  {/if}
</div>
