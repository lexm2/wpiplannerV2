<script lang="ts">
  import { appState } from '../core/state/appState.svelte';
  import { uiState } from '../services/ui/uiState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import { courseListState } from './courseListState.svelte';
  import { buildCourseView } from './courseView';
  import { expandedTerm, toggleTerm, termFlip } from './termExpansion.svelte';
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

  const INITIAL_PAGE_SIZE = 100;

  // Pagination cursor (the old CourseController INITIAL_PAGE_SIZE / load-more).
  let displayCount = $state(INITIAL_PAGE_SIZE);

  // `uiState.currentView` is a rune -> list/grid toggle recomputes on its own.
  const view = $derived(uiState.currentView);

  // Base courses replicate MainController.refreshCurrentView: a SINGLE active
  // department filter narrows to that department's courses; otherwise all
  // loaded departments' courses. `appState.loadedDepartments` +
  // `filterService.getActiveFilters()` (a SvelteMap) are reactive.
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

  const displayed = $derived(sorted.slice(0, displayCount));
  const hasMore = $derived(sorted.length > displayCount);
  const remaining = $derived(sorted.length - displayCount);
  const loadMoreText = $derived(
    remaining < INITIAL_PAGE_SIZE
      ? `Load ${remaining} more courses`
      : `Load next ${INITIAL_PAGE_SIZE} courses`,
  );

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
  <div class="empty-state">No courses found in this department.</div>
{:else if view === 'grid'}
  <div class="course-grid">
    {#each courseViews as cv (cv.course.id)}
      {@const course = cv.course}
      {@const isSelected = appState.selectedById.has(course.id)}
      {@const isBookmarked = appState.bookmarkedIds.has(course.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div
        class="course-card"
        class:selected={isSelected}
        class:active={courseListState.selectedCourseId === course.id}
        data-course-id={course.id}
        onclick={() => selectCourse(course)}
      >
        <div class="course-card-header">
          <div class="course-card-info">
            <div class="course-title-main">{course.name}</div>
            <div class="course-code-row">
              <div class="course-code-badge">
                {course.departmentAbbr}{course.number}
              </div>
              {#if cv.hasWarning}<span class="capacity-badge">At capacity</span
                >{/if}
            </div>
          </div>
          <div class="course-card-buttons">
            <button
              class="course-select-btn"
              class:selected={isSelected}
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
              class="course-bookmark-btn"
              class:bookmarked={isBookmarked}
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
  <div class="course-list">
    {#each courseViews as cv (cv.course.id)}
      {@const course = cv.course}
      {@const isSelected = appState.selectedById.has(course.id)}
      {@const isBookmarked = appState.bookmarkedIds.has(course.id)}
      {@const expanded = expandedTerm.get(course.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div
        class="course-item"
        class:selected={isSelected}
        class:active={courseListState.selectedCourseId === course.id}
        data-course-id={course.id}
        onclick={() => selectCourse(course)}
        use:termFlip={expanded}
      >
        <div class="course-header">
          <div class="course-header-controls">
            <button
              class="course-select-btn"
              class:selected={isSelected}
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
              class="course-bookmark-btn"
              class:bookmarked={isBookmarked}
              title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              onclick={e => {
                e.stopPropagation();
                toggleBookmark(course.id, isBookmarked);
              }}
              >{@html isBookmarked
                ? getInlineSVG('BOOKMARK_FILLED', 'bookmark-icon')
                : getInlineSVG('BOOKMARK', 'bookmark-icon')}</button
            >
            <div class="course-code">
              {course.departmentAbbr}{course.number}
            </div>
            <div class="course-name">
              <span class="course-name-text">{course.name}</span>
            </div>
          </div>
          <div
            class="course-sections"
            class:expanded={!!expanded}
            data-course-id={course.id}
          >
            {#if expanded}
              {@const sec = cv.sectionsByTerm.get(expanded)}
              <div class="term-sections-container" data-term={expanded}>
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <span
                  class="term-badge active"
                  class:full={sec?.allFull}
                  data-term={expanded}
                  title={sec?.allFull ? 'All sections full' : undefined}
                  onclick={e => {
                    e.stopPropagation();
                    toggleTerm(e, course.id, expanded, true);
                  }}
                >
                  <span class="term-letter">{expanded}</span>
                  {@html getInlineSVG('PLUS', 'term-icon')}
                </span>
                {#each sec?.badges ?? [] as badge (badge.key)}
                  <span
                    class="section-badge"
                    class:full={badge.isFull}
                    data-section={badge.number}
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
                    class="section-badge section-badge-overflow"
                    title="View course details for all sections"
                    >+{sec.overflow} more - see course details</span
                  >
                {/if}
              </div>
            {:else}
              <div class="term-badges-container">
                {#if cv.hasWarning}<span class="capacity-badge"
                    >At capacity</span
                  >{/if}
                {#each cv.terms as t (t.term)}
                  {#if t.available}
                    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                    <span
                      class="term-badge"
                      class:full={t.allFull}
                      data-term={t.term}
                      title={t.allFull ? 'All sections full' : undefined}
                      onclick={e => {
                        e.stopPropagation();
                        toggleTerm(e, course.id, t.term, true);
                      }}
                    >
                      <span class="term-letter">{t.term}</span>
                      {@html getInlineSVG('PLUS', 'term-icon')}
                    </span>
                  {:else}
                    <span class="term-badge unavailable" data-term={t.term}>
                      <span class="term-letter">{t.term}</span>
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

{#if hasMore}
  <div class="load-more-container">
    <button
      class="load-more-button btn btn-secondary"
      onclick={() => (displayCount += INITIAL_PAGE_SIZE)}
    >
      {loadMoreText}
    </button>
  </div>
{/if}
