<script lang="ts">
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import { courseListState } from './courseListState.svelte';
  import { formatCredits, compareSelectedCourses } from './selectedCourseUtils';
  import type { Course } from '../types/types';
  import type { CourseSelectionService } from '../services/selection/CourseSelectionService';

  let { courseSelectionService }: {
    courseSelectionService: CourseSelectionService;
  } = $props();

  // `appState.selectedCourses` is a $state.raw array — copy before sorting,
  // never mutate in place. Sort by department then number.
  const sorted = $derived([...appState.selectedCourses].sort(compareSelectedCourses));
  const count = $derived(appState.selectedCourses.length);

  // Expander state persists in localStorage (default collapsed), matching the
  // old CourseController.initializeSelectedCoursesExpander.
  let isExpanded = $state(localStorage.getItem('selectedCoursesExpanded') === 'true');

  function toggleExpander(): void {
    isExpanded = !isExpanded;
    localStorage.setItem('selectedCoursesExpanded', String(isExpanded));
  }

  function onHeaderKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpander();
    }
  }

  // Set the shared rune; CourseDescription.svelte reads it to render the panel.
  function handleSelect(course: Course): void {
    courseListState.selectedCourse = course;
  }

  function onItemKeydown(e: KeyboardEvent, course: Course): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(course);
    }
  }

  // stopPropagation so the row's own click handler (handleSelect) doesn't also
  // fire when the remove button is clicked.
  function handleRemove(e: MouseEvent, course: Course): void {
    e.stopPropagation();
    courseSelectionService.unselectCourse(course).catch(err => console.error('Failed to unselect course:', err));
  }
</script>

<div
  class="selected-courses-header"
  id="selected-courses-header"
  role="button"
  tabindex="0"
  aria-expanded={isExpanded}
  aria-controls="selected-courses-list"
  onclick={toggleExpander}
  onkeydown={onHeaderKeydown}
>
  <h3 class="selected-courses-title">Selected Courses <span id="selected-count" class="course-count">({count})</span></h3>
  <span class="chevron-icon" id="selected-courses-chevron">{@html getInlineSVG('CHEVRON_DOWN')}</span>
</div>

<div class="selected-courses-content" id="selected-courses-list" class:expanded={isExpanded}>
  {#if sorted.length === 0}
    <div class="empty-state">No courses selected yet</div>
  {:else}
    {#each sorted as sc (sc.course.id)}
      {@const course = sc.course}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div
        class="selected-course-item"
        data-course-id={course.id}
        role="button"
        tabindex="0"
        onclick={() => handleSelect(course)}
        onkeydown={(e) => onItemKeydown(e, course)}
      >
        <div class="selected-course-info">
          <div class="selected-course-code">{course.departmentAbbr}{course.number}</div>
          <div class="selected-course-name">{course.name}</div>
          <div class="selected-course-credits">{formatCredits(course)}</div>
        </div>
        <button
          class="course-remove-btn"
          data-course-id={course.id}
          title="Remove from selection"
          onclick={(e) => handleRemove(e, course)}
        >{@html getInlineSVG('TRASH', 'trash-icon')}</button>
      </div>
    {/each}
  {/if}
</div>
