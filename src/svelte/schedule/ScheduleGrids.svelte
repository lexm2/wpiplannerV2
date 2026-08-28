<script lang="ts">
  import { appState } from '../../core/state/appState.svelte';
  import {
    buildConflictMatrix,
    type BitMaskEngine,
  } from '../../core/scheduling/BitMaskEngine';
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
  import {
    TERMS,
    termFocus,
    termMotion,
    toggleFocus,
  } from './termFocus.svelte';

  let {
    colorService,
    conflictEngine,
    onOpenSectionInfo,
    onOpenDeleteEvent,
  }: {
    colorService: CourseColorService;
    conflictEngine: BitMaskEngine | null;
    onOpenSectionInfo: (courseId: string, sectionNumber: string) => void;
    onOpenDeleteEvent: (eventId: string) => void;
  } = $props();

  // Selected courses with the committed wizard preview overlaid. Shape repair
  // belongs to the storage boundary (scheduleMigration), not to a render pass.
  const selected = $derived(
    applyPreviewOverlay(
      appState.selectedCourses,
      schedulePreviewState.previewCourse,
      schedulePreviewState.selections,
    ),
  );

  // One memoized conflict matrix over every committed section - rebuilds only
  // when the set of selected section CRNs changes.
  const conflictMap = $derived(
    conflictEngine
      ? buildConflictMatrix(collectSelectedSections(selected), conflictEngine)
      : new Map<number, Set<number>>(),
  );

  const hoverCourse = $derived(
    buildHoverCourse(
      selected,
      schedulePreviewState.previewCourse,
      schedulePreviewState.hover,
    ),
  );

  const localEvents = $derived(appState.activeSchedule?.localEvents ?? []);

  // Course-color lookup. Precomputing assigns/persists colors (a side-effect), so
  // it lives in its own derived keyed on `selected` rather than inside the block
  // builder - that keeps blocksByTerm a pure transform. A recolor patches the
  // course's customColor onto appState.selectedCourses, so `selected` changes
  // identity and the colors re-derive without a separate signal.
  const colorOf = $derived.by<(id: string) => string>(() => {
    colorService.precomputeCourseColors(selected);
    return (id: string) => colorService.getCourseColor(id);
  });

  // Per-term block lists, consuming the color lookup read-only.
  const blocksByTerm = $derived.by<Record<string, TermBlocks>>(() => {
    const result: Record<string, TermBlocks> = {};
    for (const term of TERMS) {
      const termCourses = selected.filter(sc => courseShowsInTerm(sc, term));
      const termHover =
        hoverCourse && courseShowsInTerm(hoverCourse, term)
          ? hoverCourse
          : null;
      result[term] = buildTermBlocks(
        termCourses,
        termHover,
        localEvents,
        term,
        conflictMap,
        colorOf,
      );
    }
    return result;
  });
</script>

<!-- Focus state, its zoom/page animation and the wheel/touch/key input that
     drives it all live in termFocus; this stays render-only. -->
<div
  class="terms-grid"
  data-terms-grid
  data-focused-term={termFocus.term}
  class:focused={termFocus.term !== null}
  use:termMotion={termFocus.term}
>
  {#each TERMS as term (term)}
    <TermGrid
      {term}
      blocks={blocksByTerm[term].blocks}
      hasConflict={blocksByTerm[term].hasConflict}
      focused={termFocus.term === term}
      hidden={termFocus.term !== null && termFocus.term !== term}
      onToggleFocus={() => toggleFocus(term)}
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
