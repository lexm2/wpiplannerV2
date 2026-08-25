<script lang="ts">
  import Modal from './Modal.svelte';
  import { degreeState } from '../degree/degreeState.svelte';
  import { degreeViewState } from '../degree/degreeViewState.svelte';
  import { degreePlanService } from '../../services/degree/degreePlanService';
  import { focusBuckets } from '../degree/bucketFocus.svelte';
  import {
    COURSE_SORTS,
    SOURCE_LABELS,
    groupCourses,
    matchesQuery,
    type CourseIndexEntry,
    type CourseSource,
  } from '../../services/degree/courseIndex';
  import AssignMenu from '../degree/AssignMenu.svelte';
  import { getInlineSVG, type IconName } from '../../utils/iconPaths';

  /**
   * "Where did this course end up?" - the question the bucket cards cannot
   * answer, since a course can count toward several requirements at once and an
   * unplaced one appears in no card at all.
   *
   * Both halves of that answer are a destination, so every card here is two
   * links: the head goes to the catalog entry on the classes page, and each
   * bucket row goes to that bucket's card on the page behind. Nothing on a card
   * is inert text that leaves the reader to go and find the thing themselves.
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
   * Bucket rows are shown per card except when the list is already grouped by
   * bucket - there the section heading says it, and repeating it on every card
   * is noise. The heading carries the jump instead, so the mode never loses it.
   */
  const showBuckets = $derived(sort !== 'bucket');
  const bucketIds = $derived(new Set(degreeState.buckets.map(b => b.id)));

  /** Same rule for the source, which the by-source headings already spell out. */
  const showSource = $derived(sort !== 'source');

  /** Where the page learned about a course, as a glyph rather than a word. */
  const SOURCE_ICONS: Record<CourseSource, IconName> = {
    completed: 'CHECK',
    transfer: 'SCHOOL',
    planned: 'CLOCK',
    schedule: 'CALENDAR_PLUS',
  };

  /** "3 cr", and "1.5 cr" - but never "3.00 cr". */
  const credits = (n: number): string => `${Number(n.toFixed(2))} cr`;

  /** Workday spells every term "... Term"; the chip has no room to say it twice. */
  const term = (raw: string): string => raw.replace(/\s+Term\s*$/i, '');

  /** Looking the course up in the catalog means leaving for the classes page. */
  function search(entry: CourseIndexEntry): void {
    onRequestClose();
    degreePlanService.searchCatalog(entry.code, entry.year);
  }

  /**
   * Jump to a bucket on the page behind. Every bucket the course counts toward
   * flashes - that a course lands in two places at once is the finder's whole
   * point - while the one whose row was clicked is the one scrolled to.
   */
  function jump(entry: CourseIndexEntry, bucketId: string): void {
    onRequestClose();
    focusBuckets(
      entry.buckets.map(b => b.id),
      bucketId,
    );
  }

  function jumpToGroup(bucketId: string): void {
    onRequestClose();
    focusBuckets([bucketId], bucketId);
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
        <span class="course-finder-sort-icon" aria-hidden="true"
          >{@html getInlineSVG('SORT_DESCENDING')}</span
        >
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
            {#if !showBuckets && bucketIds.has(group.key)}
              <button
                type="button"
                class="course-finder-group-jump"
                onclick={() => jumpToGroup(group.key)}
              >
                Show bucket
                {@html getInlineSVG('CHEVRON_RIGHT', 'course-finder-jump-icon')}
              </button>
            {/if}
          </h3>
          <div class="course-finder-rows">
            {#each group.entries as entry (entry.key)}
              <article
                class="course-finder-row course-finder-row-{entry.source}"
              >
                <!-- One control for the whole head: code, title and badges are
                     all the same destination, and three tab stops onto one
                     catalog entry is two too many. -->
                <button
                  type="button"
                  class="course-finder-open"
                  title="Look {entry.code} up in the course catalog"
                  onclick={() => search(entry)}
                >
                  <span
                    class="course-finder-source"
                    title={SOURCE_LABELS[entry.source]}
                  >
                    {@html getInlineSVG(
                      SOURCE_ICONS[entry.source],
                      'course-finder-source-icon',
                    )}
                  </span>
                  <span class="course-finder-row-top">
                    <span class="requirement-course-code course-finder-code"
                      >{entry.code}</span
                    >
                    {@html getInlineSVG('SEARCH', 'course-finder-open-icon')}
                    <span class="course-finder-row-tags">
                      {#if entry.credits > 0}
                        <span class="course-finder-credits"
                          >{credits(entry.credits)}</span
                        >
                      {/if}
                      {#if entry.grade}
                        <span class="course-badge course-badge-grade"
                          >{entry.grade}</span
                        >
                      {/if}
                    </span>
                  </span>
                  <span class="course-finder-row-title">{entry.title}</span>
                </button>

                {#if showBuckets}
                  <div class="course-finder-row-buckets">
                    {#each entry.buckets as bucket (bucket.id)}
                      <!-- Name, live status colour and the same three-segment
                           bar its card draws: the row says which requirement
                           this course feeds AND how close that one is. -->
                      <button
                        type="button"
                        class="course-finder-bucket req-{bucket.status}"
                        title="Show {bucket.name} on the degree page"
                        onclick={() => jump(entry, bucket.id)}
                      >
                        <span class="course-finder-bucket-name"
                          >{bucket.name}</span
                        >
                        <span
                          class="course-finder-bucket-bar"
                          aria-hidden="true"
                        >
                          <span
                            class="degree-progress-seg seg-earned"
                            style:width="{bucket.segments.earned * 100}%"
                          ></span>
                          <span
                            class="degree-progress-seg seg-planned"
                            style:width="{bucket.segments.planned * 100}%"
                          ></span>
                          <span
                            class="degree-progress-seg seg-schedule"
                            style:width="{bucket.segments.schedule * 100}%"
                          ></span>
                        </span>
                        <span class="course-finder-bucket-go" aria-hidden="true"
                          >{@html getInlineSVG('CHEVRON_RIGHT')}</span
                        >
                      </button>
                    {:else}
                      <p class="course-finder-bucket is-unplaced">
                        <span class="course-finder-bucket-name"
                          >Not in a bucket</span
                        >
                      </p>
                    {/each}
                  </div>
                {/if}

                {#if showSource || entry.term || entry.courseId}
                  <footer class="course-finder-row-foot">
                    <span class="course-finder-row-meta">
                      {#if showSource}
                        <span class="course-finder-source-label"
                          >{SOURCE_LABELS[entry.source]}</span
                        >
                      {/if}
                      {#if entry.term}
                        <span class="course-finder-term"
                          >{term(entry.term)}</span
                        >
                      {/if}
                    </span>
                    {#if entry.courseId}
                      {@const courseId = entry.courseId}
                      <AssignMenu
                        {courseId}
                        currentBucketId={entry.buckets[0]?.id}
                        label="Assign {entry.code} to a bucket"
                      />
                    {/if}
                  </footer>
                {/if}
              </article>
            {/each}
          </div>
        </section>
      {/each}
    {/if}
  </div>
</Modal>
