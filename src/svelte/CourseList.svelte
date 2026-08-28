<script lang="ts">
  import listStyles from '../styles/components/course-list.module.css';
  import { appState } from '../core/state/appState.svelte';
  import { uiState } from '../services/ui/uiState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import { courseListState } from './courseListState.svelte';
  import { buildCourseView } from './courseView';
  import { expandedTerm, toggleTerm, termFlip } from './termExpansion.svelte';
  import { infiniteScroll } from './infiniteScroll';
  import type { Course } from '../types/types';
  import type { DepartmentFilterCriteria } from '../types/filters';
  import type { FilterService } from '../services/filtering/FilterService';
  import type { CourseSelectionService } from '../services/selection/CourseSelectionService';
  import type { ProfileStateManager } from '../core/state/ProfileStateManager';
  import { logger } from '../utils/logger';

  let {
    filterService,
    courseSelectionService,
    profileStateManager,
  }: {
    filterService: FilterService;
    courseSelectionService: CourseSelectionService;
    profileStateManager: ProfileStateManager;
  } = $props();

  const view = $derived(uiState.currentView);

  // Base courses: a SINGLE active department filter narrows to that department's
  // courses; otherwise all loaded departments' courses.
  // `appState.loadedDepartments` + `filterService.getActiveFilters()` (a
  // SvelteMap) are reactive.
  const baseCourses = $derived.by(() => {
    const departments = appState.loadedDepartments;
    const deptIds =
      filterService.getCriteria<DepartmentFilterCriteria>('department')
        ?.departments ?? [];
    if (deptIds.length === 1) {
      const targetId = deptIds[0].toLowerCase();
      const dept = departments.find(
        d => d.abbreviation.toLowerCase() === targetId,
      );
      if (dept) return dept.courses;
    }
    return departments.flatMap(d => d.courses);
  });

  const filtered = $derived(
    filterService.isEmpty()
      ? baseCourses
      : filterService.filterCourses(baseCourses),
  );

  // When searching, preserve relevance ranking from searchUtils; otherwise sort
  // by department then number. Copy before sorting - `dept.courses` is a
  // `$state.raw` array we must not mutate in place.
  const sorted = $derived(
    filterService.hasFilter('searchText')
      ? filtered
      : [...filtered].sort((a, b) => {
          const deptCompare = a.departmentAbbr.localeCompare(b.departmentAbbr);
          if (deptCompare !== 0) return deptCompare;
          return a.number.localeCompare(b.number);
        }),
  );

  const displayed = $derived(sorted.slice(0, courseListState.shownCount));
  const hasMore = $derived(sorted.length > courseListState.shownCount);

  const footerText = $derived(
    hasMore
      ? `Showing ${displayed.length.toLocaleString()} of ${sorted.length.toLocaleString()} courses`
      : `${sorted.length.toLocaleString()} course${sorted.length === 1 ? '' : 's'}`,
  );

  // A new result set starts at the top; without this, clearing a filter after
  // scrolling deep renders every match at once.
  $effect(() => {
    sorted;
    courseListState.resetPaging();
  });

  // Wrapped to bind `this`, named so the action keeps one identity across renders.
  function showMore(): void {
    courseListState.showMore();
  }

  // Per-course view models (term availability + deduped section badges), memoized
  // on Course identity. See courseView.ts.
  const courseViews = $derived(displayed.map(buildCourseView));

  function selectCourse(course: Course): void {
    courseListState.selectedCourse = course;
  }

  function toggleSelect(course: Course): void {
    // The service drives appState.selectedById, so the button state below
    // (isSelected) updates reactively - no optimistic DOM patching needed.
    courseSelectionService.toggleCourseSelection(course).catch(error => {
      logger.error('Failed to toggle course selection:', error);
    });
  }

  function toggleBookmark(courseId: string, isBookmarked: boolean): void {
    try {
      if (isBookmarked) profileStateManager.unbookmarkCourse(courseId);
      else profileStateManager.bookmarkCourse(courseId);
    } catch (error) {
      logger.error('Failed to toggle bookmark:', error);
    }
  }
</script>

{#if appState.loadedDepartments.length === 0}
  <div class="empty-state">Loading courses...</div>
{:else if displayed.length === 0}
  <div class="empty-state">No courses found.</div>
{:else if view === 'grid'}
  <div class={listStyles['course-grid']}>
    {#each courseViews as cv (cv.course.id)}
      {@const course = cv.course}
      {@const isSelected = appState.selectedById.has(course.id)}
      {@const isBookmarked = appState.bookmarkedIds.has(course.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div
        class={[
          listStyles['course-card'],
          {
            [listStyles['selected']]: isSelected,
            [listStyles['active']]:
              courseListState.selectedCourseId === course.id,
          },
        ]}
        data-course-id={course.id}
        data-active={courseListState.selectedCourseId === course.id
          ? ''
          : undefined}
        onclick={() => selectCourse(course)}
      >
        <div class={listStyles['course-card-header']}>
          <div class={listStyles['course-card-info']}>
            <div class={listStyles['course-title-main']}>{course.name}</div>
            <div class={listStyles['course-code-row']}>
              <div class={listStyles['course-code']}>
                {course.departmentAbbr}{course.number}
              </div>
              {#if cv.hasWarning}<span class={listStyles['capacity-badge']}
                  >At capacity</span
                >{/if}
            </div>
          </div>
          <div class={listStyles['course-card-buttons']}>
            <button
              class={[
                listStyles['course-select-btn'],
                { [listStyles['selected']]: isSelected },
              ]}
              data-select-btn
              title={isSelected ? 'Remove from selection' : 'Add to selection'}
              onclick={e => {
                e.stopPropagation();
                toggleSelect(course);
              }}
              >{@html isSelected
                ? getInlineSVG('CHECK', 'check-icon')
                : getInlineSVG('PLUS', 'plus-icon')}</button
            >
            <button
              class={[
                listStyles['course-bookmark-btn'],
                { [listStyles['bookmarked']]: isBookmarked },
              ]}
              title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              onclick={e => {
                e.stopPropagation();
                toggleBookmark(course.id, isBookmarked);
              }}
              >{@html isBookmarked
                ? getInlineSVG('BOOKMARK_FILLED', 'bookmark-icon')
                : getInlineSVG('BOOKMARK', 'bookmark-icon')}</button
            >
          </div>
        </div>
      </div>
    {/each}
  </div>
{:else}
  <div class={listStyles['course-list']}>
    {#each courseViews as cv (cv.course.id)}
      {@const course = cv.course}
      {@const isSelected = appState.selectedById.has(course.id)}
      {@const isBookmarked = appState.bookmarkedIds.has(course.id)}
      {@const expanded = expandedTerm.get(course.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div
        class={[
          listStyles['course-item'],
          {
            [listStyles['selected']]: isSelected,
            [listStyles['active']]:
              courseListState.selectedCourseId === course.id,
          },
        ]}
        data-course-id={course.id}
        data-course-item
        data-active={courseListState.selectedCourseId === course.id
          ? ''
          : undefined}
        onclick={() => selectCourse(course)}
        use:termFlip={expanded}
      >
        <div class={listStyles['course-header']}>
          <div class={listStyles['course-header-controls']}>
            <button
              class={[
                listStyles['course-select-btn'],
                { [listStyles['selected']]: isSelected },
              ]}
              data-select-btn
              title={isSelected ? 'Remove from selection' : 'Add to selection'}
              onclick={e => {
                e.stopPropagation();
                toggleSelect(course);
              }}
              >{@html isSelected
                ? getInlineSVG('CHECK', 'check-icon')
                : getInlineSVG('PLUS', 'plus-icon')}</button
            >
            <button
              class={[
                listStyles['course-bookmark-btn'],
                { [listStyles['bookmarked']]: isBookmarked },
              ]}
              title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              onclick={e => {
                e.stopPropagation();
                toggleBookmark(course.id, isBookmarked);
              }}
              >{@html isBookmarked
                ? getInlineSVG('BOOKMARK_FILLED', 'bookmark-icon')
                : getInlineSVG('BOOKMARK', 'bookmark-icon')}</button
            >
            <div class={listStyles['course-code']}>
              {course.departmentAbbr}{course.number}
            </div>
            <div class={listStyles['course-name']}>
              <span class={listStyles['course-name-text']}>{course.name}</span>
            </div>
          </div>
          <div
            class={[
              listStyles['course-sections'],
              { [listStyles['expanded']]: !!expanded },
            ]}
            data-course-id={course.id}
          >
            {#if expanded}
              {@const sec = cv.sectionsByTerm.get(expanded)}
              <div
                class={listStyles['term-sections-container']}
                data-term={expanded}
                data-term-sections
              >
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <span
                  class={[
                    listStyles['term-badge'],
                    listStyles['active'],
                    { [listStyles['full']]: sec?.allFull },
                  ]}
                  data-term={expanded}
                  data-term-badge
                  title={sec?.allFull ? 'All sections full' : undefined}
                  onclick={e => {
                    e.stopPropagation();
                    toggleTerm(e, course.id, expanded, true);
                  }}
                >
                  <span class={listStyles['term-letter']}>{expanded}</span>
                  {@html getInlineSVG('PLUS', 'term-icon')}
                </span>
                {#each sec?.badges ?? [] as badge (badge.key)}
                  <span
                    class={[
                      listStyles['section-badge'],
                      { [listStyles['full']]: badge.isFull },
                    ]}
                    data-section={badge.number}
                    data-section-badge
                    title={`${badge.profPlain}: ${badge.number}`}
                    >{#each badge.profs as p, i (i)}{#if p.url}<a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="professor-link"
                          onclick={e => e.stopPropagation()}>{p.text}</a
                        >{:else}{p.text}{/if}{#if i < badge.profs.length - 1},
                      {/if}{/each}: {badge.number}</span
                  >
                {/each}
                {#if sec && sec.overflow > 0}
                  <span
                    class={[
                      listStyles['section-badge'],
                      listStyles['section-badge-overflow'],
                    ]}
                    data-section-badge
                    title="View course details for all sections"
                    >+{sec.overflow} more - see course details</span
                  >
                {/if}
              </div>
            {:else}
              <div class={listStyles['term-badges-container']}>
                {#if cv.hasWarning}<span class={listStyles['capacity-badge']}
                    >At capacity</span
                  >{/if}
                {#each cv.terms as t (t.term)}
                  {#if t.available}
                    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                    <span
                      class={[
                        listStyles['term-badge'],
                        { [listStyles['full']]: t.allFull },
                      ]}
                      data-term={t.term}
                      data-term-badge
                      title={t.allFull ? 'All sections full' : undefined}
                      onclick={e => {
                        e.stopPropagation();
                        toggleTerm(e, course.id, t.term, true);
                      }}
                    >
                      <span class={listStyles['term-letter']}>{t.term}</span>
                      {@html getInlineSVG('PLUS', 'term-icon')}
                    </span>
                  {:else}
                    <span
                      class={[
                        listStyles['term-badge'],
                        listStyles['unavailable'],
                      ]}
                      data-term={t.term}
                      data-term-badge
                    >
                      <span class={listStyles['term-letter']}>{t.term}</span>
                    </span>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if sorted.length > 0}
  <!-- How much of the result set is on screen; live so it reaches a screen reader. -->
  <div
    class={listStyles['list-footer']}
    data-list-footer
    role="status"
    aria-live="polite"
  >
    {footerText}
  </div>
  {#if hasMore}
    <!-- Mounted only while more remains; unmounting disarms the observer. -->
    <div
      data-load-sentinel
      aria-hidden="true"
      use:infiniteScroll={showMore}
    ></div>
  {/if}
{/if}
