<script lang="ts">
  import { degreeState } from './degreeState.svelte';
  import { degreePlanService } from '../../services/degree/degreePlanService';
  import AssignMenu from './AssignMenu.svelte';
  import {
    courseDrag,
    draggableCourse,
    RAIL_TARGET,
  } from './courseDrag.svelte';
  import { slideFade } from '../transitions';

  /** Schedule courses not yet placed in a bucket. */
  const tiles = $derived(degreeState.unassigned);

  /** Highlighted while a placed course is dragged back here to unassign it. */
  const dragOver = $derived(
    courseDrag.courseId !== null && courseDrag.target === RAIL_TARGET,
  );
</script>

<div class="degree-rail-inner" class:drag-over={dragOver}>
  <header class="degree-rail-head">
    <h2 class="degree-rail-title">Unassigned</h2>
    <span class="degree-rail-count">{tiles.length}</span>
  </header>

  {#if tiles.length === 0}
    <p class="empty-state">
      Every course in your schedule has a bucket. Add courses to your schedule
      and they will show up here to place.
    </p>
  {:else}
    <p class="degree-rail-hint">
      Drag onto a bucket, or use a course's Assign menu.
    </p>
    <div class="degree-rail-list">
      {#each tiles as tile (tile.key)}
        {@const courseId = tile.courseId}
        <div
          class="requirement-course requirement-course-draggable is-schedule"
          data-course-id={courseId}
          transition:slideFade={{ duration: 180 }}
          use:draggableCourse={{ courseId, from: null }}
          role="button"
          tabindex="0"
          title="Drag onto a bucket to place it"
        >
          <div class="requirement-course-top">
            <button
              type="button"
              class="requirement-course-code requirement-course-link"
              onclick={e => {
                e.stopPropagation();
                degreePlanService.openCourse(tile.code, tile.year);
              }}>{tile.code}</button
            >
            <span class="course-badge course-badge-schedule">Schedule</span>
          </div>
          <span class="requirement-course-title">{tile.title}</span>
          {#if courseId}
            <!-- The tile is draggable, so a press that lands on these controls
                 would start a drag instead of clicking them. Cancel dragstart
                 that originates in here. -->
            <div class="requirement-course-actions">
              <AssignMenu {courseId} label="Assign {tile.code} to a bucket" />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
