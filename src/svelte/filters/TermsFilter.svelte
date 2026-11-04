<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { Course } from '../../types/types';
  import type { AcademicTerm } from '../../types/schedule';
  import type { TermFilterCriteria } from '../../types/filters';

  let {
    filterService,
    allCourses,
  }: { filterService: FilterService; allCourses: Course[] } = $props();

  const terms = $derived(
    filterService.getFilterOptions('term', allCourses) as AcademicTerm[],
  );

  const activeTerms = $derived<AcademicTerm[]>(
    filterService.getCriteria<TermFilterCriteria>('term')?.terms ?? [],
  );

  function toggleTerm(term: AcademicTerm, checked: boolean): void {
    const next = checked
      ? [...activeTerms, term]
      : activeTerms.filter(t => t !== term);
    if (next.length > 0) filterService.addFilter('term', { terms: next });
    else filterService.removeFilter('term');
  }
</script>

<FilterSection title="Terms">
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
