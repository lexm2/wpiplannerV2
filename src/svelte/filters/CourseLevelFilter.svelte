<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import { slideFade } from '../transitions';
  import { UNDERGRAD_LEVELS } from '../../core/filtering/filters/GraduateLevelFilter';
  import type { Course } from '../../types/types';
  import type { AcademicTerm } from '../../types/schedule';
  import type {
    GraduateLevelFilterCriteria,
    TermFilterCriteria,
  } from '../../types/filters';

  let {
    filterService,
    allCourses,
  }: { filterService: FilterService; allCourses: Course[] } = $props();

  type Level = 'all' | 'undergraduate' | 'graduate';

  const terms = $derived(
    filterService.getFilterOptions('term', allCourses) as AcademicTerm[],
  );

  const currentLevel = $derived<Level>(
    filterService.getCriteria<GraduateLevelFilterCriteria>('graduateLevel')
      ?.level ?? 'all',
  );

  const currentUndergradLevel = $derived(
    filterService.getCriteria<GraduateLevelFilterCriteria>('graduateLevel')
      ?.undergradLevel,
  );

  const activeTerms = $derived<AcademicTerm[]>(
    filterService.getCriteria<TermFilterCriteria>('term')?.terms ?? [],
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

  function toggleTerm(term: AcademicTerm, checked: boolean): void {
    const next = checked
      ? [...activeTerms, term]
      : activeTerms.filter(t => t !== term);
    if (next.length > 0) filterService.addFilter('term', { terms: next });
    else filterService.removeFilter('term');
  }
</script>

<FilterSection title="Course Level">
  <div class="filter-segmented-control">
    <button
      class="segmented-btn"
      class:active={currentLevel === 'all'}
      onclick={() => setLevel('all')}>All</button
    >
    <button
      class="segmented-btn"
      class:active={currentLevel === 'undergraduate'}
      onclick={() => setLevel('undergraduate')}>Undergrad</button
    >
    <button
      class="segmented-btn"
      class:active={currentLevel === 'graduate'}
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
        onclick={() => setUndergradLevel(undefined)}>All</button
      >
      {#each UNDERGRAD_LEVELS as lvl (lvl)}
        <button
          class="segmented-btn"
          class:active={currentUndergradLevel === lvl}
          onclick={() => setUndergradLevel(lvl)}>{lvl}</button
        >
      {/each}
    </div>
  {/if}
  <div class="filter-term-row">
    {#each terms as term (term)}
      <label class="filter-term-label">
        <input
          type="checkbox"
          class="filter-toggle"
          data-filter="term"
          value={term}
          checked={activeTerms.includes(term)}
          onchange={e => toggleTerm(term, e.currentTarget.checked)}
        />
        <span class="filter-term-text">{term}</span>
      </label>
    {/each}
  </div>
</FilterSection>
