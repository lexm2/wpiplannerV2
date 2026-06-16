<script lang="ts">
  import { appState } from '../../core/state/appState.svelte';
  import { getInlineSVG } from '../../utils/iconPaths';
  import { buildConflictMatrix, type BitMaskEngine } from '../../core/scheduling/BitMaskEngine';
  import { validateSelectedCourses } from '../../utils/typeGuards';
  import type { CourseColorService } from '../../services/scheduling/CourseColorService';
  import { schedulePreviewState } from './schedulePreviewState.svelte';
  import {
    applyPreviewOverlay,
    buildHoverCourse,
    collectSelectedSections,
    courseShowsInTerm,
    buildTermBlocks,
    type TermBlocks,
  } from './scheduleGeometry';
  import TermGrid from './TermGrid.svelte';

  let { colorService, conflictEngine, onOpenSectionInfo, onOpenDeleteEvent }: {
    colorService: CourseColorService;
    conflictEngine: BitMaskEngine | null;
    onOpenSectionInfo: (courseId: string, sectionNumber: string) => void;
    onOpenDeleteEvent: (eventId: string) => void;
  } = $props();

  const TERMS = ['A', 'B', 'C', 'D'];

  let focusedTerm = $state<string | null>(null);

  // Selected courses with the committed wizard preview overlaid, validated once.
  const selected = $derived.by(() =>
    validateSelectedCourses(
      applyPreviewOverlay(
        appState.selectedCourses,
        schedulePreviewState.previewCourse,
        schedulePreviewState.selections,
      ),
    )
  );

  // One memoized conflict matrix over every committed section — rebuilds only
  // when the set of selected section CRNs changes.
  const conflictMap = $derived(
    conflictEngine
      ? buildConflictMatrix(collectSelectedSections(selected), conflictEngine)
      : new Map<number, Set<number>>()
  );

  const hoverCourse = $derived(
    buildHoverCourse(selected, schedulePreviewState.previewCourse, schedulePreviewState.hover)
  );

  const localEvents = $derived(appState.activeSchedule?.localEvents ?? []);

  // Per-term block lists. A recolor patches the course's customColor onto
  // appState.selectedCourses, so `selected` (a dependency here) changes identity
  // and this re-derives the block colors — no separate signal needed.
  const blocksByTerm = $derived.by<Record<string, TermBlocks>>(() => {
    colorService.precomputeCourseColors(selected);
    const colorOf = (id: string) => colorService.getCourseColor(id);

    const result: Record<string, TermBlocks> = {};
    for (const term of TERMS) {
      const termCourses = selected.filter(sc => courseShowsInTerm(sc, term));
      const termHover = hoverCourse && courseShowsInTerm(hoverCourse, term) ? hoverCourse : null;
      result[term] = buildTermBlocks(termCourses, termHover, localEvents, term, conflictMap, colorOf);
    }
    return result;
  });

  // Desktop-only term focus (mobile uses scroll-snap). Ignored when a term is
  // already focused — matches the old document-level guard.
  function focusTerm(term: string): void {
    if (focusedTerm !== null) return;
    if (document.documentElement.classList.contains('is-mobile')) return;
    focusedTerm = term;
  }
  function unfocus(): void {
    focusedTerm = null;
  }

  $effect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && focusedTerm !== null) {
        e.preventDefault();
        unfocus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<div class="terms-grid" class:focused={focusedTerm !== null}>
  <div class="focused-term-header">
    <button class="term-back-btn" title="Back to all terms" aria-label="Back to all terms" onclick={unfocus}>{@html getInlineSVG('ARROW_BACK_UP', 'term-back-icon')}</button>
    <span class="focused-term-title">{focusedTerm ? `${focusedTerm} Term` : ''}</span>
  </div>
  {#each TERMS as term}
    <TermGrid
      {term}
      blocks={blocksByTerm[term].blocks}
      hasConflict={blocksByTerm[term].hasConflict}
      focused={focusedTerm === term}
      onFocus={() => focusTerm(term)}
      {onOpenSectionInfo}
      {onOpenDeleteEvent}
    />
  {/each}
  {#if appState.scheduleGenerating}
    <div class="schedule-generating-overlay visible">
      <span class="auto-schedule-spinner"></span>
    </div>
  {/if}
</div>
