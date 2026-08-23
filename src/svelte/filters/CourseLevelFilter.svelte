<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
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

  const activeTerms = $derived<AcademicTerm[]>(
    filterService.getCriteria<TermFilterCriteria>('term')?.terms ?? [],
  );

  function setLevel(level: Level): void {
    if (level === 'all') filterService.removeFilter('graduateLevel');
    else filterService.addFilter('graduateLevel', { level });
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
