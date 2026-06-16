<script lang="ts">
  import { getInlineSVG } from '../utils/iconPaths';
  import { scheduleSidebarState } from './scheduleSidebarState.svelte';
  import type { SelectedCourse } from '../types/schedule';

  let { selectedCourse, incompleteInfo, onOpenWizard, onRemove, onClearSections }: {
    selectedCourse: SelectedCourse;
    incompleteInfo: { isIncomplete: boolean; message: string };
    onOpenWizard: () => void;
    onRemove: () => void;
    onClearSections: () => void;
  } = $props();

  const course = $derived(selectedCourse.course);
  const credits = $derived(
    course.minCredits === course.maxCredits
      ? `${course.minCredits} credits`
      : `${course.minCredits}-${course.maxCredits} credits`
  );
  const hasComponents = $derived(
    !!(selectedCourse.selectedLecture || selectedCourse.selectedDiscussion || selectedCourse.selectedLab)
  );
  // The grid sets the hovered course id; this item highlights when it matches —
  // replacing ScheduleController's sidebarCourseItems map + classList toggles.
  const highlighted = $derived(scheduleSidebarState.hoveredCourseId === course.id);

  // The whole header opens the wizard (old MainController .schedule-course-header
  // delegation). The control buttons stopPropagation so they don't also open it.
  function handleHeaderKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpenWizard();
    }
  }
  function handleClear(e: MouseEvent): void {
    e.stopPropagation();
    onClearSections();
  }
  function handleRemove(e: MouseEvent): void {
    e.stopPropagation();
    onRemove();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="sidebar-content-item schedule-course-item collapsed"
  class:sidebar-course-highlighted={highlighted}
  data-course-id={course.id}
>
  <div
    class="schedule-course-header"
    role="button"
    tabindex="0"
    onclick={onOpenWizard}
    onkeydown={handleHeaderKeydown}
  >
    <div class="schedule-course-info">
      <div class="schedule-course-code">{course.departmentAbbr}{course.number}</div>
      <div class="schedule-course-name">{course.name}</div>
      {#if hasComponents || incompleteInfo.isIncomplete}
        <div class="schedule-course-components">
          {#if selectedCourse.selectedLecture}
            <span class="selected-component lec">Lec {selectedCourse.selectedLecture.number}</span>
          {/if}
          {#if selectedCourse.selectedDiscussion}
            <span class="selected-component dis">Dis {selectedCourse.selectedDiscussion.number}</span>
          {/if}
          {#if selectedCourse.selectedLab}
            <span class="selected-component lab">Lab {selectedCourse.selectedLab.number}</span>
          {/if}
          {#if incompleteInfo.isIncomplete}
            <span class="incomplete-warning" title={incompleteInfo.message}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" class="warning-icon"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 2c5.523 0 10 4.477 10 10a10 10 0 0 1 -19.995 .324l-.005 -.324l.004 -.28c.148 -5.393 4.566 -9.72 9.996 -9.72zm.01 13l-.127 .007a1 1 0 0 0 0 1.986l.117 .007l.127 -.007a1 1 0 0 0 0 -1.986l-.117 -.007zm-.01 -8a1 1 0 0 0 -.993 .883l-.007 .117v4l.007 .117a1 1 0 0 0 1.986 0l.007 -.117v-4l-.007 -.117a1 1 0 0 0 -.993 -.883z" /></svg>
            </span>
          {/if}
        </div>
      {/if}
      <div class="schedule-course-credits">{credits}</div>
    </div>
    <div class="course-item-controls">
      <button
        class="course-clear-sections-btn"
        data-course-id={course.id}
        title="Clear selected sections"
        onclick={handleClear}
      >{@html getInlineSVG('ERASER', 'eraser-icon')}</button>
      <button
        class="course-remove-btn"
        data-course-id={course.id}
        title="Remove from selection"
        onclick={handleRemove}
      >{@html getInlineSVG('TRASH', 'trash-icon')}</button>
    </div>
  </div>
</div>
