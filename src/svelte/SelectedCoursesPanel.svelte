<script lang="ts">
  import styles from '../styles/components/right-panel.module.css';
  import { slide } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { slideFade, dur } from './transitions';
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import { courseListState } from './courseListState.svelte';
  import { formatCredits } from './selectedCourseUtils';
  import type { Course } from '../types/types';
  import type { CourseSelectionService } from '../services/selection/CourseSelectionService';
  import { logger } from '../utils/logger';
  import { STORAGE_KEYS } from '../utils/storageKeys';

  let {
    courseSelectionService,
    onPickSections,
  }: {
    courseSelectionService: CourseSelectionService;
    /** Takes the student to the Schedule page, where sections are chosen. */
    onPickSections: () => void;
  } = $props();

  // Insertion order - the store appends, so new courses land at the bottom.
  const courses = $derived(appState.selectedCourses);
  const count = $derived(courses.length);

  // Expander state persists in localStorage (default collapsed).
  let isExpanded = $state(
    localStorage.getItem(STORAGE_KEYS.SELECTED_COURSES_EXPANDED) === 'true',
  );

  function toggleExpander(): void {
    isExpanded = !isExpanded;
    localStorage.setItem(
      STORAGE_KEYS.SELECTED_COURSES_EXPANDED,
      String(isExpanded),
    );
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

  // stopPropagation so the row's own click handler (handleSelect) doesn't also
  // fire when the remove button is clicked. The repeat clicks of a
  // double-click are dropped: the row is gone after the first, and with no
  // outro the next row has already moved under the pointer.
  function handleRemove(e: MouseEvent, course: Course): void {
    e.stopPropagation();
    if (e.detail > 1) return;
    courseSelectionService
      .unselectCourse(course)
      .catch(err => logger.error('Failed to unselect course:', err));
  }
</script>

<div
  class={styles['selected-courses-header']}
  id="selected-courses-header"
  role="button"
  tabindex="0"
  aria-expanded={isExpanded}
  aria-controls="selected-courses-list"
  onclick={toggleExpander}
  onkeydown={onHeaderKeydown}
>
  <h3 class={styles['selected-courses-title']}>
    Selected Courses <span id="selected-count" class={styles['course-count']}
      >({count})</span
    >
  </h3>
  <span class="chevron-icon" id="selected-courses-chevron"
    >{@html getInlineSVG('CHEVRON_DOWN')}</span
  >
</div>

{#if isExpanded}
  <div
    class={styles['selected-courses-content']}
    id="selected-courses-list"
    transition:slide={{ duration: dur(280), easing: cubicOut }}
  >
    {#if courses.length === 0}
      <div class="empty-state" transition:slideFade={{ duration: 220 }}>
        No courses selected yet
      </div>
    {:else}
      <!-- Adding a course here only selects it; its sections are picked on the
           Schedule page, which nothing else on this page says. First in the
           list so it never scrolls out of reach of a long one. -->
      <button
        type="button"
        class={styles['pick-sections-link']}
        id="pick-sections-link"
        transition:slideFade={{ duration: 220 }}
        onclick={onPickSections}>Pick sections on the Schedule page</button
      >
    {/if}
    {#each courses as sc (sc.course.id)}
      {@const course = sc.course}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (mouse convenience; the course code button is the keyboard route) -->
      <div
        class={styles['selected-course-item']}
        data-course-id={course.id}
        transition:slideFade={{ duration: 260 }}
        animate:flip={{ duration: dur(260), easing: cubicOut }}
        onclick={() => handleSelect(course)}
      >
        <div class={styles['selected-course-info']}>
          <button
            type="button"
            class={styles['selected-course-code']}
            aria-label="{course.departmentAbbr}{course.number} {course.name}"
            aria-current={courseListState.selectedCourseId === course.id
              ? 'true'
              : undefined}>{course.departmentAbbr}{course.number}</button
          >
          <div class={styles['selected-course-name']}>{course.name}</div>
          <div class={styles['selected-course-credits']}>
            {formatCredits(course)}
          </div>
        </div>
        <button
          class={styles['course-remove-btn']}
          data-course-id={course.id}
          title="Remove from selection"
          aria-label="Remove {course.departmentAbbr}{course.number} from selection"
          onclick={e => handleRemove(e, course)}
          >{@html getInlineSVG('TRASH', 'trash-icon')}</button
        >
      </div>
    {/each}
  </div>
{/if}
