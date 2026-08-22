<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { CreditRangeFilterCriteria } from '../../types/filters';

  let { filterService }: { filterService: FilterService } = $props();

  const criteria = $derived(filterService.getCriteria<CreditRangeFilterCriteria>('creditRange'));
  const minCredits = $derived(criteria?.min ?? 1);
  // Default max is 4 (the top of the full 1-4 range) so the off-state below is
  // reachable from the max input.
  const maxCredits = $derived(criteria?.max ?? 4);

  // Off when at the full default range (1-4), matching the controller.
  function update(min: number, max: number): void {
    if (min && max && (min !== 1 || max !== 4)) {
      filterService.addFilter('creditRange', { min, max });
    } else {
      filterService.removeFilter('creditRange');
    }
  }
</script>

<FilterSection title="Credit Hours">
  <div class="filter-range-container">
    <div class="filter-range-inputs">
      <div class="filter-range-input">
        <label for="credit-min">Min Credits</label>
        <input
          id="credit-min"
          type="number"
          min="1"
          max="4"
          value={minCredits}
          onchange={(e) => update(parseInt(e.currentTarget.value), maxCredits)}
        />
      </div>
      <div class="filter-range-input">
        <label for="credit-max">Max Credits</label>
        <input
          id="credit-max"
          type="number"
          min="1"
          max="4"
          value={maxCredits}
          onchange={(e) => update(minCredits, parseInt(e.currentTarget.value))}
        />
      </div>
    </div>
    <div class="filter-quick-select">
      <button class="filter-quick-btn" onclick={() => update(1, 1)}>1</button>
      <button class="filter-quick-btn" onclick={() => update(2, 2)}>2</button>
      <button class="filter-quick-btn" onclick={() => update(3, 3)}>3</button>
    </div>
  </div>
</FilterSection>
