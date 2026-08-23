<script lang="ts">
  import DualRangeSlider from './DualRangeSlider.svelte';
  import Field from '../ui/Field.svelte';
  import FilterSection from './FilterSection.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { RMPRatingFilterCriteria } from '../../types/filters';

  let { filterService }: { filterService: FilterService } = $props();

  // Read the active criteria ONCE at mount; the sliders own their values after
  // that and write back to the service (debounced). Matches the controller,
  // which seeded the sliders from criteria and never re-synced them while open.
  // svelte-ignore state_referenced_locally - intentional one-time seed read.
  const initial: RMPRatingFilterCriteria =
    filterService.getCriteria<RMPRatingFilterCriteria>('rmpRating') ?? {};

  let ratingMin = $state(initial.minRating ?? 0);
  let ratingMax = $state(initial.maxRating ?? 5);
  let difficultyMin = $state(initial.minDifficulty ?? 0);
  let difficultyMax = $state(initial.maxDifficulty ?? 5);
  let retakeMin = $state(initial.minWouldTakeAgain ?? 0);
  let retakeMax = $state(initial.maxWouldTakeAgain ?? 100);
  let includeWithoutData = $state(initial.includeWithoutData ?? true);

  function writeFilter(): void {
    const isDefault =
      ratingMin === 0 &&
      ratingMax === 5 &&
      difficultyMin === 0 &&
      difficultyMax === 5 &&
      retakeMin === 0 &&
      retakeMax === 100 &&
      includeWithoutData === true;

    if (isDefault) {
      filterService.removeFilter('rmpRating');
    } else {
      filterService.addFilter('rmpRating', {
        minRating: ratingMin,
        maxRating: ratingMax,
        minDifficulty: difficultyMin,
        maxDifficulty: difficultyMax,
        minWouldTakeAgain: retakeMin,
        maxWouldTakeAgain: retakeMax,
        includeWithoutData,
      });
    }
  }

  // 300ms debounce: any slider drag / checkbox flip resets the timer (the old
  // SharedFilterSetup used the same 300ms window). The effect depends only on
  // local state, so writing to the service can't re-trigger it.
  $effect(() => {
    ratingMin;
    ratingMax;
    difficultyMin;
    difficultyMax;
    retakeMin;
    retakeMax;
    includeWithoutData;
    const t = setTimeout(writeFilter, 300);
    return () => clearTimeout(t);
  });
</script>

<FilterSection title="Rate My Professor">
  <div class="filter-slider-container">
    <Field
      group
      label="Rating"
      controlId="rmp-rating"
      fieldClass="filter-slider-group"
    >
      {#snippet children()}
        <div class="filter-slider-values">
          <span>{ratingMin.toFixed(1)}</span>
          <span>-</span>
          <span>{ratingMax.toFixed(1)}</span>
          <span class="filter-input-hint">stars</span>
        </div>
        <DualRangeSlider
          min={0}
          max={5}
          step={0.1}
          bind:minValue={ratingMin}
          bind:maxValue={ratingMax}
          leftLabel="Minimum Rating"
          rightLabel="Maximum Rating"
        />
      {/snippet}
    </Field>
    <Field
      group
      label="Difficulty"
      controlId="rmp-difficulty"
      fieldClass="filter-slider-group"
    >
      {#snippet children()}
        <div class="filter-slider-values">
          <span>{difficultyMin.toFixed(1)}</span>
          <span>-</span>
          <span>{difficultyMax.toFixed(1)}</span>
          <span class="filter-input-hint">scale</span>
        </div>
        <DualRangeSlider
          min={0}
          max={5}
          step={0.1}
          bind:minValue={difficultyMin}
          bind:maxValue={difficultyMax}
          leftLabel="Minimum Difficulty"
          rightLabel="Maximum Difficulty"
        />
      {/snippet}
    </Field>
    <Field
      group
      label="Would Take Again"
      controlId="rmp-retake"
      fieldClass="filter-slider-group"
    >
      {#snippet children()}
        <div class="filter-slider-values">
          <span>{retakeMin}</span>
          <span>-</span>
          <span>{retakeMax}</span>
          <span class="filter-input-hint">%</span>
        </div>
        <DualRangeSlider
          min={0}
          max={100}
          step={1}
          bind:minValue={retakeMin}
          bind:maxValue={retakeMax}
          leftLabel="Minimum Would Take Again"
          rightLabel="Maximum Would Take Again"
        />
      {/snippet}
    </Field>
  </div>
  <label class="filter-toggle-label filter-subsection">
    <input
      type="checkbox"
      class="filter-toggle"
      bind:checked={includeWithoutData}
    />
    <span class="filter-toggle-text">Include professors without RMP data</span>
  </label>
  <div class="filter-hint">
    <small>Note: Filters are off when at default ranges.</small>
  </div>
</FilterSection>
