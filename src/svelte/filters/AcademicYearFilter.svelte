<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { ProfileStateManager } from '../../core/state/ProfileStateManager';
  import type { Course } from '../../types/types';
  import type { AcademicYearFilterCriteria } from '../../types/filters';

  let {
    filterService,
    profileStateManager,
    allCourses,
  }: {
    filterService: FilterService;
    profileStateManager: ProfileStateManager;
    allCourses: Course[];
  } = $props();

  const years = $derived(
    [
      ...new Set(
        allCourses.map(c => c.academicYear).filter(Boolean) as number[],
      ),
    ].sort((a, b) => a - b),
  );

  const currentYear = $derived<number | 'all'>(
    filterService.getCriteria<AcademicYearFilterCriteria>('academicYear')
      ?.year ?? 'all',
  );

  function setYear(year: number | 'all'): void {
    if (year === 'all') filterService.removeFilter('academicYear');
    else filterService.addFilter('academicYear', { year });
    // Keep the active schedule's year in sync with the chosen filter year.
    const active = profileStateManager.getActiveSchedule();
    if (active) {
      profileStateManager.updateSchedule(
        active.id,
        { year: year === 'all' ? undefined : (year as number) },
        'filter-sync',
      );
    }
  }
</script>

{#if years.length > 1}
  <FilterSection title="Academic Year">
    <div class="filter-segmented-control">
      <button
        class="segmented-btn"
        class:active={currentYear === 'all'}
        onclick={() => setYear('all')}>All</button
      >
      {#each years as y (y)}
        <button
          class="segmented-btn"
          class:active={currentYear === y}
          onclick={() => setYear(y)}>{y}-{y + 1}</button
        >
      {/each}
    </div>
  </FilterSection>
{/if}
