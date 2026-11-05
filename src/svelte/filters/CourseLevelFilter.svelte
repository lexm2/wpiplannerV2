<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import { slideFade } from '../transitions';
  import { UNDERGRAD_LEVELS } from '../../types/filters';
  import type { GraduateLevelFilterCriteria } from '../../types/filters';

  let { filterService }: { filterService: FilterService } = $props();

  type Level = 'all' | 'undergraduate' | 'graduate';

  const currentLevel = $derived<Level>(
    filterService.getCriteria<GraduateLevelFilterCriteria>('graduateLevel')
      ?.level ?? 'all',
  );

  const currentUndergradLevel = $derived(
    filterService.getCriteria<GraduateLevelFilterCriteria>('graduateLevel')
      ?.undergradLevel,
  );

  function setLevel(level: Level): void {
    if (level === 'all') filterService.removeFilter('graduateLevel');
    else filterService.addFilter('graduateLevel', { level });
  }

  function setUndergradLevel(
    undergradLevel: GraduateLevelFilterCriteria['undergradLevel'],
  ): void {
    filterService.addFilter(
      'graduateLevel',
      undergradLevel === undefined
        ? { level: 'undergraduate' }
        : { level: 'undergraduate', undergradLevel },
    );
  }
</script>

<FilterSection title="Course Level">
  <div class="filter-segmented-control" role="group" aria-label="Course level">
    <button
      class="segmented-btn"
      class:active={currentLevel === 'all'}
      aria-pressed={currentLevel === 'all'}
      onclick={() => setLevel('all')}>All</button
    >
    <button
      class="segmented-btn"
      class:active={currentLevel === 'undergraduate'}
      aria-pressed={currentLevel === 'undergraduate'}
      onclick={() => setLevel('undergraduate')}>Undergrad</button
    >
    <button
      class="segmented-btn"
      class:active={currentLevel === 'graduate'}
      aria-pressed={currentLevel === 'graduate'}
      onclick={() => setLevel('graduate')}>Graduate</button
    >
  </div>
  {#if currentLevel === 'undergraduate'}
    <div
      class="filter-segmented-control filter-segmented-sub"
      role="group"
      aria-label="Undergraduate level"
      transition:slideFade={{ duration: 150 }}
    >
      <button
        class="segmented-btn"
        class:active={currentUndergradLevel === undefined}
        aria-pressed={currentUndergradLevel === undefined}
        onclick={() => setUndergradLevel(undefined)}>All</button
      >
      {#each UNDERGRAD_LEVELS as lvl (lvl)}
        <button
          class="segmented-btn"
          class:active={currentUndergradLevel === lvl}
          aria-pressed={currentUndergradLevel === lvl}
          onclick={() => setUndergradLevel(lvl)}>{lvl}</button
        >
      {/each}
    </div>
  {/if}
</FilterSection>
