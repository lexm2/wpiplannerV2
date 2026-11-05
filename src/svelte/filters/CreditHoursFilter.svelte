<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import TextField from '../ui/TextField.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { CreditRangeFilterCriteria } from '../../types/filters';

  let { filterService }: { filterService: FilterService } = $props();

  // Catalog credits run from 0 (seminars) through 6, in quarter steps (0.75 and
  // 1.5 are common), and the filter is off when it spans all of that.
  const FULL_MIN = 0;
  const FULL_MAX = 6;

  const criteria = $derived(
    filterService.getCriteria<CreditRangeFilterCriteria>('creditRange'),
  );
  const minCredits = $derived(criteria?.min ?? FULL_MIN);
  const maxCredits = $derived(criteria?.max ?? FULL_MAX);

  function update(min: number, max: number): void {
    if (min > FULL_MIN || max < FULL_MAX) {
      filterService.addFilter('creditRange', { min, max });
    } else {
      filterService.removeFilter('creditRange');
    }
  }

  // Typed values clamp to the range and push the other bound along rather than
  // being rejected. The field is rewritten afterwards, because when the stored
  // value doesn't change (7 clamped to an existing 6, or junk) nothing would
  // re-render it and it would keep showing a number the filter isn't using.
  function clamp(n: number): number {
    return Math.min(FULL_MAX, Math.max(FULL_MIN, n));
  }

  function onMinChange(input: HTMLInputElement): void {
    const n = input.value.trim() === '' ? NaN : Number(input.value);
    if (Number.isFinite(n)) {
      const min = clamp(n);
      update(min, Math.max(min, maxCredits));
    }
    input.value = String(minCredits);
  }

  function onMaxChange(input: HTMLInputElement): void {
    const n = input.value.trim() === '' ? NaN : Number(input.value);
    if (Number.isFinite(n)) {
      const max = clamp(n);
      update(Math.min(minCredits, max), max);
    }
    input.value = String(maxCredits);
  }

  const QUICK: { label: string; min: number; max: number }[] = [
    { label: 'Under 1', min: 0, max: 1 },
    { label: '1.5', min: 1.5, max: 1.5 },
    { label: '2', min: 2, max: 2 },
    { label: '3', min: 3, max: 3 },
  ];
</script>

<FilterSection title="Credit Hours">
  <div class="filter-range-container">
    <div class="filter-range-inputs">
      <TextField
        id="credit-min"
        type="number"
        inputmode="decimal"
        label="Min Credits"
        panel
        min={FULL_MIN}
        max={FULL_MAX}
        step={0.25}
        value={String(minCredits)}
        onchange={e => onMinChange(e.currentTarget as HTMLInputElement)}
      />
      <TextField
        id="credit-max"
        type="number"
        inputmode="decimal"
        label="Max Credits"
        panel
        min={FULL_MIN}
        max={FULL_MAX}
        step={0.25}
        value={String(maxCredits)}
        onchange={e => onMaxChange(e.currentTarget as HTMLInputElement)}
      />
    </div>
    <div class="filter-quick-select" role="group" aria-label="Credit presets">
      {#each QUICK as q (q.label)}
        <button
          class="filter-quick-btn"
          aria-pressed={minCredits === q.min && maxCredits === q.max}
          onclick={() => update(q.min, q.max)}>{q.label}</button
        >
      {/each}
    </div>
  </div>
</FilterSection>
