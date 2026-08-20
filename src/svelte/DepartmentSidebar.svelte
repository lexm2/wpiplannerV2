<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { appState } from '../core/state/appState.svelte';
  import { groupDepartmentsByCategory } from '../utils/departmentUtils';
  import type { FilterService } from '../services/filtering/FilterService';
  import type { DepartmentFilterCriteria } from '../types/filters';

  let { filterService }: { filterService: FilterService } = $props();

  // Track *collapsed* categories (not expanded) so categories that appear after
  // data loads default to expanded — matching the old DepartmentController.
  const collapsed = new SvelteSet<string>();

  // Source data + active filter state are reactive: `appState.loadedDepartments`
  // is a rune, and `filterService.getActiveFilters()` reads a SvelteMap. So the
  // list, active highlighting, and counts all recompute on their own — this
  // replaces DepartmentController's manual displayDepartments/syncVisualState.
  const departments = $derived(appState.loadedDepartments);
  const categories = $derived(groupDepartmentsByCategory(departments));

  const activeDepts = $derived(
    filterService.getCriteria<DepartmentFilterCriteria>('department')?.departments ?? []
  );
  const activeSet = $derived(new Set(activeDepts));

  // Per-department counts reflect what the OTHER active filters allow (the
  // department filter itself is excluded), mirroring updateCourseCounts().
  const counts = $derived.by(() => {
    const map = new Map<string, number>();
    let total = 0;
    if (departments.length === 0) return { map, total };

    const hasNonDeptFilters = filterService.getActiveFilters().some(f => f.id !== 'department');
    const allCourses = departments.flatMap(d => d.courses);
    const passing = hasNonDeptFilters
      ? new Set(filterService.filterCoursesExcluding(allCourses, ['department']).map(c => c.id))
      : null;

    for (const dept of departments) {
      const count = passing
        ? dept.courses.filter(c => passing.has(c.id)).length
        : dept.courses.length;
      map.set(dept.abbreviation, count);
      total += count;
    }
    return { map, total };
  });

  function isExpanded(name: string): boolean {
    return !collapsed.has(name);
  }

  function toggleCategory(name: string): void {
    if (collapsed.has(name)) collapsed.delete(name);
    else collapsed.add(name);
  }

  function selectDepartment(deptId: string, e: MouseEvent): void {
    if (deptId === 'all') {
      filterService.removeFilter('department');
      return;
    }

    const multiSelect = e.ctrlKey || e.metaKey;
    const current = activeDepts;
    let next: string[];
    if (multiSelect) {
      next = current.includes(deptId)
        ? current.filter(id => id !== deptId)
        : [...current, deptId];
    } else {
      next = (current.length === 1 && current[0] === deptId) ? [] : [deptId];
    }

    if (next.length > 0) filterService.addFilter('department', { departments: next });
    else filterService.removeFilter('department');
  }
</script>

{#if departments.length === 0}
  <div class="loading-message">Loading departments...</div>
{:else}
  <div class="department-category">
    <div class="department-list expanded">
      <button
        type="button"
        class="department-item all-departments"
        class:active={activeSet.size === 0}
        data-dept-id="all"
        onclick={(e) => selectDepartment('all', e)}
      >
        All Departments ({counts.total})
      </button>
    </div>
  </div>

  {#each Object.entries(categories) as [categoryName, depts] (categoryName)}
    {#if depts.length > 0}
      <div class="department-category">
        <button
          type="button"
          class="category-header"
          data-category={categoryName}
          aria-expanded={isExpanded(categoryName)}
          onclick={() => toggleCategory(categoryName)}
        >
          {categoryName}
        </button>
        <div class="department-list" class:expanded={isExpanded(categoryName)}>
          {#each depts as dept (dept.abbreviation)}
            <button
              type="button"
              class="department-item"
              class:active={activeSet.has(dept.abbreviation)}
              data-dept-id={dept.abbreviation}
              onclick={(e) => selectDepartment(dept.abbreviation, e)}
            >
              {dept.name} ({counts.map.get(dept.abbreviation) ?? dept.courses.length})
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {/each}
{/if}
