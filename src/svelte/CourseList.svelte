<script lang="ts">
  import { tick } from 'svelte';
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

  let { filterService, courseSelectionService, profileStateManager }: {
    filterService: FilterService;
    courseSelectionService: CourseSelectionService;
    profileStateManager: ProfileStateManager;
  } = $props();

  const INITIAL_PAGE_SIZE = 100;

  // Pagination cursor (the old CourseController INITIAL_PAGE_SIZE / load-more).
  let displayCount = $state(INITIAL_PAGE_SIZE);
  // courseId -> expanded term letter ('A'|'B'|'C'|'D'). Replaces MainController's
  // imperative `expandedTerms` Map + the ~250-line FLIP height animation.
  const expandedTerm = new SvelteMap<string, string>();
  // courseId -> .course-item height captured at click time, before the DOM swaps.
  // The FLIP needs the *pre-swap* height; an action's update() runs post-swap.
  const pendingStartHeight = new Map<string, number>();

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

  // Svelte transitions don't auto-respect prefers-reduced-motion; snapshot at mount.
  const reduceMotion = typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ~2ms per pixel of height delta, clamped to [200, 500]ms — ports the old
  // MainController.getHeightAnimDuration so longer expansions take a bit longer.
  function heightAnimDuration(from: number, to: number): number {
    return Math.min(500, Math.max(200, Math.abs(to - from) * 2)) / 1000;
  }

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

  // Identity-keyed memo: a CourseView depends only on the Course object, which is
  // a `$state.raw` value replaced wholesale on data refresh — so a cache hit means
  // the data is unchanged, and refreshed courses are new objects that miss cleanly.
  // Saves rebuilding the already-shown rows every time load-more grows `displayed`.
  const courseViewCache = new WeakMap<Course, CourseView>();

  // Per-course view model: term availability + the (deduped) section badges for
  // each term. Mirrors ProgressiveRenderer.createCourseListItem exactly.
  function buildCourseView(course: Course): CourseView {
    const cached = courseViewCache.get(course);
    if (cached) return cached;

    const allSecs = getAllSections(course);
    const sectionsByTermRaw = new Map<string, Section[]>();
    for (const section of allSecs) {
      const term = section.computedTerm || 'Unknown';
      if (!sectionsByTermRaw.has(term)) sectionsByTermRaw.set(term, []);
      sectionsByTermRaw.get(term)!.push(section);
    }

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

    const courseView: CourseView = { course, hasWarning, terms, sectionsByTerm };
    courseViewCache.set(course, courseView);
    return courseView;
  }

  const courseViews = $derived(displayed.map(buildCourseView));

  const BADGE_STEP_MS = 30; // per-step delay of the diagonal crumb cascade

  // Group badges into their wrapped visual rows by offsetTop (flex-wrap lays them
  // out in rows); within a row they keep DOM order. Used for the diagonal cascade.
  function groupBadgeRows(badges: HTMLElement[]): HTMLElement[][] {
    const rowMap = new Map<number, HTMLElement[]>();
    for (const b of badges) {
      const top = b.offsetTop;
      if (!rowMap.has(top)) rowMap.set(top, []);
      rowMap.get(top)!.push(b);
    }
    return Array.from(rowMap.keys()).sort((a, b) => a - b).map(k => rowMap.get(k)!);
  }

  // Lock a row at its current height + clip overflow synchronously, before the
  // rune mutation triggers the {#if} swap. This stops the new content from
  // painting at full size for one frame (the flash) — it renders clipped inside
  // the locked height until termFlip animates the height to its new value.
  function lockForFlip(item: HTMLElement, courseId: string): void {
    const h = item.getBoundingClientRect().height;
    item.style.height = `${h}px`;
    item.style.overflow = 'hidden';
    item.style.willChange = 'height';
    pendingStartHeight.set(courseId, h);
  }

  function toggleTerm(e: MouseEvent, courseId: string, term: string, available: boolean): void {
    if (!available) return;
    const item = (e.currentTarget as HTMLElement | null)?.closest('.course-item') as HTMLElement | null;
    const container = item?.querySelector('.term-sections-container') as HTMLElement | null;
    const collapsing = expandedTerm.get(courseId) === term;

    // Collapsing with motion: play the open animation in reverse — fade the
    // section badges out diagonally from the bottom-right up to the top-left,
    // THEN collapse the row. The {#if} swap removes the badges from the DOM the
    // instant the rune flips, so the fade must run here, before that mutation.
    if (collapsing && item && container && !reduceMotion) {
      const rows = groupBadgeRows(
        Array.from(container.querySelectorAll('.section-badge')) as HTMLElement[]
      );
      let maxStep = 0;
      rows.forEach((row, ri) => row.forEach((_, ci) => { maxStep = Math.max(maxStep, ri + ci); }));
      rows.forEach((row, ri) => {
        row.forEach((b, ci) => {
          b.style.transition = 'opacity 0.15s ease';
          // Reverse the diagonal: highest (rowIndex + colIndex) fades first.
          window.setTimeout(() => { b.style.opacity = '0'; }, (maxStep - (ri + ci)) * BADGE_STEP_MS);
        });
      });
      // Once the crumbs have faded out, lock the height and flip to collapsed.
      window.setTimeout(() => {
        lockForFlip(item, courseId);
        expandedTerm.delete(courseId);
      }, maxStep * BADGE_STEP_MS + 150);
      return;
    }

    if (item) lockForFlip(item, courseId);
    if (collapsing) expandedTerm.delete(courseId);
    else expandedTerm.set(courseId, term);
  }

  // Port of the old MainController FLIP height animation. Driven by the
  // `expandedTerm` rune: when a course's expanded term changes, Svelte swaps the
  // {#if expanded} content, then this action animates the .course-item height
  // from its old value to its new one (overflow clipped during the tween) and
  // fades the section badges ("crumbs") in one-by-one. Badges start at opacity:0
  // in CSS so they can never flash their finished state before the animation.
  function termFlip(item: HTMLElement, term: string | undefined) {
    let current = term;
    let cancel: (() => void) | null = null;

    function run(startH: number): void {
      cancel?.();

      // The row is already locked at startH with overflow:hidden (set in the
      // click handler, before the swap painted). Measure the new content's full
      // height while it's at auto — also the moment to read each badge's wrapped
      // row position — then snap back to startH before adding the transition.
      item.style.willChange = 'height';
      item.style.overflow = 'hidden';
      item.style.height = 'auto';
      const targetH = item.getBoundingClientRect().height;

      // Group section badges into visual rows. The stagger delay is diagonal —
      // (rowIndex + colIndex) * step — so each row starts one step after the
      // previous instead of waiting for it to finish. A single row is just
      // 0,1,2,…; many rows cascade as a wavefront without taking years.
      const rows = groupBadgeRows(
        Array.from(item.querySelectorAll('.term-sections-container .section-badge')) as HTMLElement[]
      );

      item.style.height = `${startH}px`;
      void item.offsetHeight; // commit start height before adding the transition
      const dur = reduceMotion ? 0 : heightAnimDuration(startH, targetH);
      item.style.transition = `height ${dur}s ease`;

      // Prime the crumbs (inline transition; CSS already holds them at opacity 0)
      // and compute the longest delay so cleanup waits for the whole cascade.
      let maxDelay = 0;
      if (!reduceMotion) {
        rows.forEach((row, rowIndex) => {
          row.forEach((b, colIndex) => {
            b.style.transition = 'opacity 0.15s ease';
            maxDelay = Math.max(maxDelay, (rowIndex + colIndex) * BADGE_STEP_MS);
          });
        });
      }

      const timers: ReturnType<typeof setTimeout>[] = [];
      requestAnimationFrame(() => {
        item.style.height = `${targetH}px`;
        if (!reduceMotion) {
          rows.forEach((row, rowIndex) => {
            row.forEach((b, colIndex) => {
              timers.push(setTimeout(() => {
                b.style.opacity = '1';
              }, (rowIndex + colIndex) * BADGE_STEP_MS));
            });
          });
        }
      });

      const finish = (): void => {
        for (const t of timers) clearTimeout(t);
        item.style.height = '';
        item.style.transition = '';
        item.style.overflow = '';
        item.style.willChange = '';
        cancel = null;
      };

      const total = Math.max(dur * 1000, maxDelay + 200) + 100;
      const timer = setTimeout(finish, total);
      cancel = () => { clearTimeout(timer); finish(); };
    }

    return {
      update(next: string | undefined): void {
        if (next === current) return;
        current = next;
        // Start height was captured at click (pre-swap); fall back to live height.
        const courseId = item.dataset.courseId;
        const startH = (courseId != null ? pendingStartHeight.get(courseId) : undefined)
          ?? item.getBoundingClientRect().height;
        if (courseId != null) pendingStartHeight.delete(courseId);
        // Wait for the {#if} swap to land, then animate to the new height.
        tick().then(() => run(startH));
      },
      destroy(): void {
        cancel?.();
      },
    };
  }

  function selectCourse(course: Course): void {
    courseListState.selectedCourse = course;
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
        use:termFlip={expanded}
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
          <div class="course-sections" class:expanded={!!expanded} data-course-id={course.id}>
            {#if expanded}
              {@const sec = cv.sectionsByTerm.get(expanded)}
              <div class="term-sections-container" data-term={expanded}>
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <span
                  class="term-badge active"
                  class:full={sec?.allFull}
                  data-term={expanded}
                  title={sec?.allFull ? 'All sections full' : undefined}
                  onclick={(e) => { e.stopPropagation(); toggleTerm(e, course.id, expanded, true); }}
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
                      onclick={(e) => { e.stopPropagation(); toggleTerm(e, course.id, t.term, true); }}
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
