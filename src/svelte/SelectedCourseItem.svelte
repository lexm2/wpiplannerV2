<script lang="ts">
  import { getInlineSVG } from '../utils/iconPaths';
  import {
    scheduleSidebarState,
    revealSidebarCourse,
  } from './scheduleSidebarState.svelte';
  import { formatCredits } from './selectedCourseUtils';
  import { sectionsOf } from '../utils/courseUtils';
  import { COMPONENT_KINDS, type ComponentKind } from '../types/types';
  import type { SelectedCourse } from '../types/schedule';

  // Badge label and colour class per component kind. Adding a kind is a line here.
  const BADGES: Record<ComponentKind, { label: string; cls: string }> = {
    lecture: { label: 'Lec', cls: 'lec' },
    discussion: { label: 'Dis', cls: 'dis' },
    lab: { label: 'Lab', cls: 'lab' },
  };

  let {
    selectedCourse,
    incompleteInfo,
    onOpenWizard,
    onRemove,
    onClearSections,
  }: {
    selectedCourse: SelectedCourse;
    incompleteInfo: { isIncomplete: boolean; message: string };
    onOpenWizard: () => void;
    onRemove: () => void;
    onClearSections: () => void;
  } = $props();

  const course = $derived(selectedCourse.course);
  const credits = $derived(formatCredits(course));
  // Value-based, not Object.keys: a key holding undefined must not read as
  // "has sections".
  const hasComponents = $derived(
    sectionsOf(selectedCourse.selected).length > 0,
  );
  // The grid sets the hovered course id; this item highlights when it matches.
  const highlighted = $derived(
    scheduleSidebarState.hoveredCourseId === course.id,
  );

  let itemEl = $state<HTMLElement | null>(null);

  // The list is taller than the panel as soon as a few courses are selected, so
  // the item the grid just named is as often as not scrolled out of it. Scroll
  // it back rather than highlighting something nobody can see.
  $effect(() => {
    if (highlighted && itemEl) revealSidebarCourse(itemEl);
  });

  // The whole header opens the wizard; the control buttons stopPropagation so a
  // click on them doesn't also open the wizard.
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

<div
  class="sidebar-content-item schedule-course-item collapsed"
  class:sidebar-course-highlighted={highlighted}
  data-course-id={course.id}
  bind:this={itemEl}
>
  <div
    class="schedule-course-header"
    role="button"
    tabindex="0"
    onclick={onOpenWizard}
    onkeydown={handleHeaderKeydown}
  >
    <div class="schedule-course-info">
      <div class="schedule-course-code">
        {course.departmentAbbr}{course.number}
      </div>
      <div class="schedule-course-name">{course.name}</div>
      {#if hasComponents || incompleteInfo.isIncomplete}
        <div class="schedule-course-components">
          {#each COMPONENT_KINDS as kind (kind)}
            {@const section = selectedCourse.selected[kind]}
            {#if section}
              <span class="selected-component {BADGES[kind].cls}"
                >{BADGES[kind].label} {section.number}</span
              >
            {/if}
          {/each}
          {#if incompleteInfo.isIncomplete}
            <span class="incomplete-warning" title={incompleteInfo.message}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                class="warning-icon"
                ><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
                  d="M12 2c5.523 0 10 4.477 10 10a10 10 0 0 1 -19.995 .324l-.005 -.324l.004 -.28c.148 -5.393 4.566 -9.72 9.996 -9.72zm.01 13l-.127 .007a1 1 0 0 0 0 1.986l.117 .007l.127 -.007a1 1 0 0 0 0 -1.986l-.117 -.007zm-.01 -8a1 1 0 0 0 -.993 .883l-.007 .117v4l.007 .117a1 1 0 0 0 1.986 0l.007 -.117v-4l-.007 -.117a1 1 0 0 0 -.993 -.883z"
                /></svg
              >
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
        >{@html getInlineSVG('ERASER', 'eraser-icon')}</button
      >
      <button
        class="course-remove-btn"
        data-course-id={course.id}
        title="Remove from selection"
        onclick={handleRemove}
        >{@html getInlineSVG('TRASH', 'trash-icon')}</button
      >
    </div>
  </div>
</div>
