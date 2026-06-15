<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import { appState } from '../core/state/appState.svelte';
  import { uiState } from '../services/ui/uiState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import { getAllSections } from '../utils/courseUtils';
  import { rateMyProfessorService } from '../services/external/RateMyProfessorService';
  import { courseListState } from './courseListState.svelte';
  import type { Course, Section } from '../types/types';
  import type { FilterService } from '../services/filtering/FilterService';
  import type { CourseSelectionService } from '../services/selection/CourseSelectionService';
  import type { ProfileStateManager } from '../core/state/ProfileStateManager';

  let { filterService, courseSelectionService, profileStateManager, onSelectCourse }: {
    filterService: FilterService;
    courseSelectionService: CourseSelectionService;
    profileStateManager: ProfileStateManager;
    onSelectCourse: (course: Course) => void;
  } = $props();

  const INITIAL_PAGE_SIZE = 100;

  // Pagination cursor (the old CourseController INITIAL_PAGE_SIZE / load-more).
  let displayCount = $state(INITIAL_PAGE_SIZE);
  // courseId -> expanded term letter ('A'|'B'|'C'|'D'). Replaces MainController's
  // imperative `expandedTerms` Map + the ~250-line FLIP height animation.
  const expandedTerm = new SvelteMap<string, string>();

  // `uiState.currentView` is a rune → list/grid toggle recomputes on its own.
  const view = $derived(uiState.currentView);

  // Base courses replicate MainController.refreshCurrentView: a SINGLE active
  // department filter narrows to that department's courses; otherwise all
  // loaded departments' courses. `appState.loadedDepartments` +
  // `filterService.getActiveFilters()` (a SvelteMap) are reactive.
  const baseCourses = $derived.by(() => {
    const departments = appState.loadedDepartments;
    const deptFilter = filterService.getActiveFilters().find(f => f.id === 'department');
    const deptIds = (deptFilter?.criteria as { departments?: string[] } | undefined)?.departments ?? [];
    if (deptIds.length === 1) {
      const targetId = deptIds[0].toLowerCase();
      const dept = departments.find(d => d.abbreviation.toLowerCase() === targetId);
      if (dept) return dept.courses;
    }
    return departments.flatMap(d => d.courses);
  });

  const filtered = $derived(
    filterService.isEmpty() ? baseCourses : filterService.filterCourses(baseCourses)
  );

  // When searching, preserve relevance ranking from searchUtils; otherwise sort
  // by department then number. Copy before sorting — `dept.courses` is a
  // `$state.raw` array we must not mutate in place.
  const sorted = $derived(
    filterService.hasFilter('searchText')
      ? filtered
      : [...filtered].sort((a, b) => {
          const deptCompare = a.departmentAbbr.localeCompare(b.departmentAbbr);
          if (deptCompare !== 0) return deptCompare;
          return a.number.localeCompare(b.number);
        })
  );

  const displayed = $derived(sorted.slice(0, displayCount));
  const hasMore = $derived(sorted.length > displayCount);
  const remaining = $derived(sorted.length - displayCount);
  const loadMoreText = $derived(
    remaining < INITIAL_PAGE_SIZE
      ? `Load ${remaining} more courses`
      : `Load next ${INITIAL_PAGE_SIZE} courses`
  );

  const TERMS = ['A', 'B', 'C', 'D'] as const;
  const MAX_BADGES = 100;

  type ProfLink = { text: string; url: string | null };
  interface SectionBadge {
    key: string;
    number: string;
    isFull: boolean;
    profPlain: string;
    profs: ProfLink[];
  }
  interface TermInfo {
    term: string;
    available: boolean;
    allFull: boolean;
  }
  interface CourseView {
    course: Course;
    hasWarning: boolean;
    terms: TermInfo[];
    sectionsByTerm: Map<string, { badges: SectionBadge[]; overflow: number; allFull: boolean }>;
  }

  function isMeaningfulProf(prof: string): boolean {
    return !!prof && prof !== 'TBA' && prof !== 'Not Assigned' && prof.trim() !== '';
  }

  // Per-course view model: term availability + the (deduped) section badges for
  // each term. Mirrors ProgressiveRenderer.createCourseListItem exactly.
  function buildCourseView(course: Course): CourseView {
    const sectionsByTermRaw = new Map<string, Section[]>();
    for (const section of getAllSections(course)) {
      const term = section.computedTerm || 'Unknown';
      if (!sectionsByTermRaw.has(term)) sectionsByTermRaw.set(term, []);
      sectionsByTermRaw.get(term)!.push(section);
    }

    const allSecs = getAllSections(course);
    const hasWarning = allSecs.length > 0 && allSecs.every(s => s.seatsAvailable <= 0);

    const terms: TermInfo[] = TERMS.map(term => {
      const secs = sectionsByTermRaw.get(term);
      return {
        term,
        available: !!secs,
        allFull: !!secs && secs.every(s => s.seatsAvailable <= 0),
      };
    });

    const sectionsByTerm = new Map<string, { badges: SectionBadge[]; overflow: number; allFull: boolean }>();
    for (const term of TERMS) {
      const sections = sectionsByTermRaw.get(term);
      if (!sections) continue;

      // Dedupe sections sharing a number, preferring those that list a professor.
      const byNumber = new Map<string, Section[]>();
      for (const section of sections) {
        if (!byNumber.has(section.number)) byNumber.set(section.number, []);
        byNumber.get(section.number)!.push(section);
      }
      const deduped: Section[] = [];
      byNumber.forEach(group => {
        if (group.length <= 1) {
          deduped.push(...group);
          return;
        }
        const withProf = group.filter(s => s.periods.some(p => isMeaningfulProf(p.professor)));
        if (withProf.length > 0) deduped.push(...withProf);
        else deduped.push(group[0]);
      });

      const total = deduped.length;
      const display = deduped.slice(0, MAX_BADGES);
      const badges: SectionBadge[] = display.map((section, i) => {
        const profSet = new Set<string>();
        section.periods.forEach(p => {
          if (isMeaningfulProf(p.professor)) profSet.add(p.professor);
        });
        const profArray = Array.from(profSet);
        const profPlain = profArray.join(', ') || 'TBA';
        const profs: ProfLink[] = profArray.length > 0
          ? profArray.map(prof => ({ text: prof, url: rateMyProfessorService.getProfessorRMPUrl(prof) }))
          : [{ text: 'TBA', url: null }];
        return {
          key: `${section.number}-${i}`,
          number: section.number,
          isFull: section.seatsAvailable <= 0,
          profPlain,
          profs,
        };
      });

      sectionsByTerm.set(term, {
        badges,
        overflow: total > MAX_BADGES ? total - MAX_BADGES : 0,
        allFull: sections.every(s => s.seatsAvailable <= 0),
      });
    }

    return { course, hasWarning, terms, sectionsByTerm };
  }

  const courseViews = $derived(displayed.map(buildCourseView));

  function toggleTerm(courseId: string, term: string, available: boolean): void {
    if (!available) return;
    if (expandedTerm.get(courseId) === term) expandedTerm.delete(courseId);
    else expandedTerm.set(courseId, term);
  }

  function selectCourse(course: Course): void {
    courseListState.selectedCourseId = course.id;
    onSelectCourse(course);
  }

  function toggleSelect(course: Course): void {
    // The service drives appState.selectedById, so the button state below
    // (isSelected) updates reactively — no optimistic DOM patching needed.
    courseSelectionService.toggleCourseSelection(course).catch(error => {
      console.error('Failed to toggle course selection:', error);
    });
  }

  function toggleBookmark(courseId: string, isBookmarked: boolean): void {
    try {
      if (isBookmarked) profileStateManager.unbookmarkCourse(courseId);
      else profileStateManager.bookmarkCourse(courseId);
    } catch (error) {
      console.error('Failed to toggle bookmark:', error);
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
              <div class="course-code-badge">{course.departmentAbbr}{course.number}</div>
              {#if cv.hasWarning}<span class="capacity-badge">At capacity</span>{/if}
            </div>
          </div>
          <div class="course-card-buttons">
            <button
              class="course-select-btn"
              class:selected={isSelected}
              title={isSelected ? 'Remove from selection' : 'Add to selection'}
              onclick={(e) => { e.stopPropagation(); toggleSelect(course); }}
            >{@html isSelected ? getInlineSVG('CHECK', 'check-icon') : getInlineSVG('PLUS', 'plus-icon')}</button>
            <button
              class="course-bookmark-btn"
              class:bookmarked={isBookmarked}
              title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              onclick={(e) => { e.stopPropagation(); toggleBookmark(course.id, isBookmarked); }}
            >{@html isBookmarked ? getInlineSVG('BOOKMARK_FILLED', 'bookmark-icon') : getInlineSVG('BOOKMARK', 'bookmark-icon')}</button>
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
      >
        <div class="course-header">
          <div class="course-header-controls">
            <button
              class="course-select-btn"
              class:selected={isSelected}
              title={isSelected ? 'Remove from selection' : 'Add to selection'}
              onclick={(e) => { e.stopPropagation(); toggleSelect(course); }}
            >{@html isSelected ? getInlineSVG('CHECK', 'check-icon') : getInlineSVG('PLUS', 'plus-icon')}</button>
            <button
              class="course-bookmark-btn"
              class:bookmarked={isBookmarked}
              title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              onclick={(e) => { e.stopPropagation(); toggleBookmark(course.id, isBookmarked); }}
            >{@html isBookmarked ? getInlineSVG('BOOKMARK_FILLED', 'bookmark-icon') : getInlineSVG('BOOKMARK', 'bookmark-icon')}</button>
            <div class="course-code">{course.departmentAbbr}{course.number}</div>
            <div class="course-name">
              <span class="course-name-text">{course.name}</span>
            </div>
          </div>
          <div class="course-sections" class:expanded={expanded} data-course-id={course.id}>
            {#if expanded}
              {@const sec = cv.sectionsByTerm.get(expanded)}
              <div class="term-sections-container" data-term={expanded}>
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <span
                  class="term-badge active"
                  class:full={sec?.allFull}
                  data-term={expanded}
                  title={sec?.allFull ? 'All sections full' : undefined}
                  onclick={(e) => { e.stopPropagation(); toggleTerm(course.id, expanded, true); }}
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
                  >{#each badge.profs as p, i (i)}{#if p.url}<a href={p.url} target="_blank" rel="noopener noreferrer" class="professor-link" onclick={(e) => e.stopPropagation()}>{p.text}</a>{:else}{p.text}{/if}{#if i < badge.profs.length - 1}, {/if}{/each}: {badge.number}</span>
                {/each}
                {#if sec && sec.overflow > 0}
                  <span class="section-badge section-badge-overflow" title="View course details for all sections">+{sec.overflow} more — see course details</span>
                {/if}
              </div>
            {:else}
              <div class="term-badges-container">
                {#if cv.hasWarning}<span class="capacity-badge">At capacity</span>{/if}
                {#each cv.terms as t (t.term)}
                  {#if t.available}
                    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                    <span
                      class="term-badge"
                      class:full={t.allFull}
                      data-term={t.term}
                      title={t.allFull ? 'All sections full' : undefined}
                      onclick={(e) => { e.stopPropagation(); toggleTerm(course.id, t.term, true); }}
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
    <button class="load-more-button btn btn-secondary" onclick={() => (displayCount += INITIAL_PAGE_SIZE)}>
      {loadMoreText}
    </button>
  </div>
{/if}
