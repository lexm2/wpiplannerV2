<script lang="ts">
  import { appState } from '../core/state/appState.svelte';
  import { getComputedTerm } from '../utils/typeGuards';
  import { AcademicTerm } from '../types/schedule';
  import SelectedCourseItem from './SelectedCourseItem.svelte';
  import { compareSelectedCourses, TERM_ORDER, TERM_LABELS } from './selectedCourseUtils';
  import type { SelectedCourse } from '../types/schedule';
  import type { Course } from '../types/types';
  import type { CourseSelectionService } from '../services/selection/CourseSelectionService';
  import { logger } from '../utils/logger';

  let { courseSelectionService, getIncompleteInfo, onOpenWizard }: {
    courseSelectionService: CourseSelectionService;
    getIncompleteInfo: (sc: SelectedCourse) => { isIncomplete: boolean; message: string };
    onOpenWizard: (course: Course, existing: SelectedCourse | undefined) => void;
  } = $props();

  // Group selected courses by computed term, sorted dept->number within each
  // group; unscheduled (and unknown terms) sort last. The list is reactive on
  // appState.selectedCourses, so add/remove/section changes re-render on their own.
  const groups = $derived.by(() => {
    const sorted = [...appState.selectedCourses].sort(compareSelectedCourses);

    const byTerm = new Map<AcademicTerm | 'UNSCHEDULED', SelectedCourse[]>();
    for (const sc of sorted) {
      const term = (getComputedTerm(sc) as AcademicTerm | null) ?? 'UNSCHEDULED';
      if (!byTerm.has(term)) byTerm.set(term, []);
      byTerm.get(term)!.push(sc);
    }

    const sortedKeys = [...byTerm.keys()].sort((a, b) => {
      const ai = a === 'UNSCHEDULED' ? -1 : TERM_ORDER.indexOf(a);
      const bi = b === 'UNSCHEDULED' ? -1 : TERM_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    return sortedKeys.map((termKey) => ({
      termKey,
      label: termKey === 'UNSCHEDULED' ? 'Unscheduled' : TERM_LABELS[termKey],
      courses: byTerm.get(termKey)!,
    }));
  });

  const isEmpty = $derived(appState.selectedCourses.length === 0);

  function handleRemove(course: Course): void {
    courseSelectionService.unselectCourse(course).catch((err) =>
      logger.error('Failed to unselect course:', err)
    );
  }
  function handleClearSections(course: Course): void {
    courseSelectionService.clearCourseComponents(course).catch((err) =>
      logger.error('Failed to clear course components:', err)
    );
  }
</script>

{#if isEmpty}
  <div class="empty-state">No courses selected yet</div>
{:else}
  {#each groups as group (group.termKey)}
    <div class="term-separator">
      <span class="term-separator-label">{group.label}</span>
      <span class="term-separator-line"></span>
    </div>
    {#each group.courses as sc (sc.course.id)}
      <SelectedCourseItem
        selectedCourse={sc}
        incompleteInfo={getIncompleteInfo(sc)}
        onOpenWizard={() => onOpenWizard(sc.course, sc)}
        onRemove={() => handleRemove(sc.course)}
        onClearSections={() => handleClearSections(sc.course)}
      />
    {/each}
  {/each}
{/if}
