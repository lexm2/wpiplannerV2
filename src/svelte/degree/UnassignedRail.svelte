<script lang="ts">
  import { degreeState } from './degreeState.svelte';
  import { degreePlanService } from '../../services/degree/degreePlanService';
  import { appState } from '../../core/state/appState.svelte';
  import {
    computeUnassigned,
    type DegreeTile,
  } from '../../services/degree/degreeBuckets';
  import AssignMenu from './AssignMenu.svelte';
  import {
    courseDrag,
    draggableCourse,
    RAIL_TARGET,
    SLOT_MS,
  } from './courseDrag.svelte';
  import { slideFade } from '../transitions';

  /**
   * The rail behaves like the bucket-config list: nothing grows or shrinks in
   * place. Dragging a tile out closes its slot (courseDrag collapses the
   * placeholder it left behind), and dragging one in opens a slot ahead of it
   * here, so on release the tile simply appears in a gap that already fits it.
   * That is also why the tiles carry no transition of their own - the old
   * slide/fade fired again after a drop had already moved the tile away.
   */

  /** Schedule courses not yet placed in a bucket. */
  const tiles = $derived(degreeState.unassigned);

  /** Highlighted while a placed course is dragged back here to unassign it. */
  const dragOver = $derived(
    courseDrag.courseId !== null && courseDrag.target === RAIL_TARGET,
  );

  let listEl = $state<HTMLElement | null>(null);

  /**
   * Where a course dragged in from a bucket would land. The rail's order comes
   * from the schedule, not from the drop point, so ask the same function that
   * builds the list what it would return once the course is unassigned - that
   * way the slot opens exactly where the tile ends up.
   *
   * null while nothing is incoming, including for a tile lifted out of the rail
   * itself: that one still holds its own slot.
   */
  const incomingIndex = $derived.by(() => {
    const id = courseDrag.courseId;
    if (id === null || courseDrag.target !== RAIL_TARGET) return null;
    if (tiles.some(t => t.courseId === id)) return null;
    const assignments = { ...degreeState.config.assignments };
    delete assignments[id];
    const next = computeUnassigned(
      degreeState.record,
      appState.selectedCourses,
      assignments,
    );
    const index = next.findIndex(t => t.courseId === id);
    return index < 0 ? null : index;
  });

  /**
   * A rail tile's height, not the dragged one's: the tile is narrower in a
   * bucket and wraps its title differently, so a neighbour here is the closer
   * guess at the space the incoming course will actually need.
   */
  const slotHeight = $derived.by(() => {
    if (incomingIndex === null) return 0;
    const sample = listEl?.querySelector<HTMLElement>('.requirement-course');
    return sample?.offsetHeight || courseDrag.height || 60;
  });

  interface RailSlot {
    key: string;
    /** null for the empty slot held open for an incoming course. */
    tile: DegreeTile | null;
  }

  /** The tiles, with the incoming course's empty slot spliced into place. */
  const slots = $derived.by<RailSlot[]>(() => {
    const list: RailSlot[] = tiles.map(tile => ({ key: tile.key, tile }));
    if (incomingIndex !== null)
      list.splice(incomingIndex, 0, { key: 'incoming', tile: null });
    return list;
  });
</script>

<div class="degree-rail-inner" class:drag-over={dragOver}>
  <header class="degree-rail-head">
    <h2 class="degree-rail-title">Unassigned</h2>
    <span class="degree-rail-count">{tiles.length}</span>
  </header>

  {#if slots.length === 0}
    <p class="empty-state">
      Every course in your schedule has a bucket. Add courses to your schedule
      and they will show up here to place.
    </p>
  {:else}
    <p class="degree-rail-hint">
      Drag onto a bucket, or use a course's Assign menu.
    </p>
    <div class="degree-rail-list" bind:this={listEl}>
      {#each slots as slot (slot.key)}
        {#if slot.tile === null}
          <!-- The gap held open for the course being dragged in.
               |global because the {#if} is mounted and unmounted by the {#each}
               around it, and a local transition stays silent for that. Separate
               in:/out: rather than one transition:, because a bidirectional
               transition builds its config once and reuses it - the outro would
               never see `settling`, and the gap would collapse under the real
               tile arriving in its place. -->
          <div
            class="degree-rail-slot"
            style:height="{slotHeight}px"
            aria-hidden="true"
            in:slideFade|global={{ duration: SLOT_MS }}
            out:slideFade|global={{
              duration: courseDrag.settling ? 0 : SLOT_MS,
            }}
          ></div>
        {:else}
          {@const tile = slot.tile}
          {@const courseId = tile.courseId}
          <div
            class="requirement-course requirement-course-draggable is-schedule"
            data-course-id={courseId}
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
        {/if}
      {/each}
    </div>
  {/if}
</div>
