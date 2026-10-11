<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import TextField from '../ui/TextField.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { CreditRangeFilterCriteria } from '../../types/filters';

  let { filterService }: { filterService: FilterService } = $props();

  const criteria = $derived(
    filterService.getCriteria<CreditRangeFilterCriteria>('creditRange'),
  );
  const minCredits = $derived(criteria?.min ?? 1);
  // Default max is 4 (the top of the full 1-4 range) so the off-state below is
  // reachable from the max input.
  const maxCredits = $derived(criteria?.max ?? 4);

  // Off when at the full default range (1-4).
  function update(min: number, max: number): void {
    if (min && max && (min !== 1 || max !== 4)) {
      filterService.addFilter('creditRange', { min, max });
    } else {
      filterService.removeFilter('creditRange');
    }
  }

  // Typed values clamp to 1-4 and push the other bound along rather than
  // being rejected. The field is rewritten afterwards, because when the stored
  // value doesn't change (7 clamped to an existing 4, or junk) nothing would
  // re-render it and it would keep showing a number the filter isn't using.
  function clamp(n: number): number {
    return Math.min(4, Math.max(1, n));
  }

  function onMinChange(input: HTMLInputElement): void {
    const n = parseInt(input.value);
    if (!Number.isNaN(n)) {
      const min = clamp(n);
      update(min, Math.max(min, maxCredits));
    }
    input.value = String(minCredits);
  }

  function onMaxChange(input: HTMLInputElement): void {
    const n = parseInt(input.value);
    if (!Number.isNaN(n)) {
      const max = clamp(n);
      update(Math.min(minCredits, max), max);
    }
    input.value = String(maxCredits);
  }
</script>

<FilterSection title="Credit Hours">
  <div class="filter-range-container">
    <div class="filter-range-inputs">
      <TextField
        id="credit-min"
        type="number"
        inputmode="numeric"
        label="Min Credits"
        panel
        min={1}
        max={4}
        value={String(minCredits)}
        onchange={e => onMinChange(e.currentTarget as HTMLInputElement)}
      />
      <TextField
        id="credit-max"
        type="number"
        inputmode="numeric"
        label="Max Credits"
        panel
        min={1}
        max={4}
        value={String(maxCredits)}
        onchange={e => onMaxChange(e.currentTarget as HTMLInputElement)}
      />
    </div>
    <div class="filter-quick-select">
      <button class="filter-quick-btn" onclick={() => update(1, 1)}>1</button>
      <button class="filter-quick-btn" onclick={() => update(2, 2)}>2</button>
      <button class="filter-quick-btn" onclick={() => update(3, 3)}>3</button>
    </div>
  </div>
</FilterSection>
