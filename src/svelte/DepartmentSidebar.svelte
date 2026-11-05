<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import { groupDepartmentsByCategory } from '../utils/departmentUtils';
  import type { FilterService } from '../services/filtering/FilterService';
  import type {
    AcademicYearFilterCriteria,
    DepartmentFilterCriteria,
  } from '../types/filters';
  import type { Department } from '../types/types';

  let { filterService }: { filterService: FilterService } = $props();

  // Track *collapsed* categories (not expanded) so categories that appear after
  // data loads default to expanded.
  const collapsed = new SvelteSet<string>();

  // Source data + active filter state are reactive: `appState.loadedDepartments`
  // is a rune, and `filterService.getActiveFilters()` reads a SvelteMap. So the
  // list, active highlighting, and counts all recompute on their own.
  const departments = $derived(appState.loadedDepartments);

  const activeDepts = $derived(
    filterService.getCriteria<DepartmentFilterCriteria>('department')
      ?.departments ?? [],
  );
  const activeSet = $derived(new Set(activeDepts));

  // The selected academic year decides which departments exist: one with no
  // courses in it would only lead to an empty list. The active department
  // stays listed so the student can always see and undo their choice. Filters
  // other than the year only zero a department's count, which says why.
  const year = $derived(
    filterService.getCriteria<AcademicYearFilterCriteria>('academicYear')?.year,
  );
  function offeredInYear(dept: Department): boolean {
    return (
      year === undefined ||
      year === 'all' ||
      dept.courses.some(c => c.academicYear === year)
    );
  }
  const categories = $derived(
    Object.fromEntries(
      Object.entries(groupDepartmentsByCategory(departments)).map(
        ([name, depts]) => [
          name,
          depts.filter(d => activeSet.has(d.abbreviation) || offeredInYear(d)),
        ],
      ),
    ),
  );

  // Per-department counts reflect what the OTHER active filters allow (the
  // department filter itself is excluded).
  const counts = $derived.by(() => {
    const map = new Map<string, number>();
    let total = 0;
    if (departments.length === 0) return { map, total };

    const hasNonDeptFilters = filterService
      .getActiveFilters()
      .some(f => f.id !== 'department');
    const allCourses = departments.flatMap(d => d.courses);
    const passing = hasNonDeptFilters
      ? new Set(
          filterService
            .filterCoursesExcluding(allCourses, ['department'])
            .map(c => c.id),
        )
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
      next = current.length === 1 && current[0] === deptId ? [] : [deptId];
    }

    if (next.length > 0)
      filterService.addFilter('department', { departments: next });
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
        aria-pressed={activeSet.size === 0}
        data-dept-id="all"
        onclick={e => selectDepartment('all', e)}
      >
        All Departments ({counts.total})
      </button>
    </div>
  </div>

  {#each Object.entries(categories) as [categoryName, depts] (categoryName)}
    {#if depts.length > 0}
      {@const expanded = isExpanded(categoryName)}
      {@const listId = `department-list-${categoryName.replace(/\W+/g, '-')}`}
      {@const activeHere = depts.filter(d => activeSet.has(d.abbreviation))}
      <div class="department-category">
        <button
          type="button"
          class="category-header"
          data-category={categoryName}
          aria-expanded={expanded}
          aria-controls={listId}
          onclick={() => toggleCategory(categoryName)}
        >
          <span class="category-header-chevron" aria-hidden="true"
            >{@html getInlineSVG(
              expanded ? 'CHEVRON_DOWN' : 'CHEVRON_RIGHT',
            )}</span
          >
          <span class="category-header-name">{categoryName}</span>
          <!-- A collapsed category hides its departments, so it says when one
               of them is what the list is showing. -->
          {#if !expanded && activeHere.length > 0}
            <span
              class="category-header-active"
              title={activeHere.map(d => d.name).join(', ')}
              >{activeHere.length} selected</span
            >
          {/if}
        </button>
        <!-- inert keeps a collapsed list out of the Tab order and the
             accessibility tree; the max-height transition only hides it. -->
        <div
          class="department-list"
          class:expanded
          id={listId}
          inert={!expanded}
        >
          {#each depts as dept (dept.abbreviation)}
            <button
              type="button"
              class="department-item"
              class:active={activeSet.has(dept.abbreviation)}
              aria-pressed={activeSet.has(dept.abbreviation)}
              data-dept-id={dept.abbreviation}
              onclick={e => selectDepartment(dept.abbreviation, e)}
            >
              {dept.name} ({counts.map.get(dept.abbreviation) ??
                dept.courses.length})
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {/each}
{/if}
