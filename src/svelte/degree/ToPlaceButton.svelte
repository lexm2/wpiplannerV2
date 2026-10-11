<script lang="ts">
  import { degreeState } from './degreeState.svelte';
  import { reduceMotion } from '../transitions';

  /**
   * The Degree page's button in the phone bottom bar's left slot - where the
   * other pages keep their drawer button - so the tabs stay centred. It counts
   * the courses still to place, and takes you to the To place list.
   */
  const count = $derived(degreeState.unassigned.length);

  function show(): void {
    degreeState.toPlaceOpen = true;
    document
      .querySelector('#degree-page .degree-main')
      ?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
</script>

<button
  type="button"
  class="filter-btn drawer-toggle drawer-toggle-to-place"
  aria-label="Courses to place ({count})"
  title={count ? `Courses to place (${count})` : 'Every course has a bucket'}
  disabled={count === 0}
  onclick={show}
>
  <svg
    class="drawer-toggle-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 13h3l3 3h4l3 -3h3" />
  </svg>
  {#if count}
    <span class="drawer-toggle-count" aria-hidden="true">{count}</span>
  {/if}
</button>
