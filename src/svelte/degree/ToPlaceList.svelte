<script lang="ts">
  import { degreeState, openMoveSheet } from './degreeState.svelte';
  import { getInlineSVG } from '../../utils/iconPaths';
  import { slideFade } from '../transitions';

  /**
   * The phone's stand-in for the Unassigned rail: the same courses, at the top
   * of the page's one scroller instead of in a second pane of their own, which
   * on a phone took a third of the screen. It folds to a single row, and each
   * course opens the Move sheet. Placing the last one removes it altogether.
   */
  const tiles = $derived(degreeState.unassigned);
</script>

{#if tiles.length}
  <section
    class="degree-to-place"
    id="degree-to-place"
    aria-label="Courses to place"
  >
    <button
      type="button"
      class="degree-to-place-head"
      aria-expanded={degreeState.toPlaceOpen}
      onclick={() => (degreeState.toPlaceOpen = !degreeState.toPlaceOpen)}
    >
      <span class="degree-to-place-title">To place</span>
      <span class="degree-to-place-count">{tiles.length}</span>
      <span class="degree-to-place-hint"
        >{tiles.length === 1 ? 'Needs a bucket' : 'Need a bucket'}</span
      >
      {@html getInlineSVG('CHEVRON_DOWN', 'degree-to-place-chevron')}
    </button>
    {#if degreeState.toPlaceOpen}
      <div
        class="degree-to-place-list"
        transition:slideFade={{ duration: 180 }}
      >
        {#each tiles as tile (tile.key)}
          {#if tile.courseId}
            {@const courseId = tile.courseId}
            <button
              type="button"
              class="degree-to-place-row"
              data-course-id={courseId}
              aria-label="Place {tile.code}, {tile.title}"
              onclick={() => openMoveSheet(courseId)}
            >
              <span class="requirement-course-code">{tile.code}</span>
              <span class="degree-to-place-name">{tile.title}</span>
              {@html getInlineSVG('CHEVRON_RIGHT', 'degree-to-place-go')}
            </button>
          {/if}
        {/each}
      </div>
    {/if}
  </section>
{/if}
