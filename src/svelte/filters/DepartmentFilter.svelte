<script lang="ts">
  import { getDepartmentCategory, CATEGORY_ORDER } from '../../utils/departmentUtils';
  import FilterSection from './FilterSection.svelte';
  import TextField from '../ui/TextField.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { Course } from '../../types/types';
  import type { DepartmentFilterCriteria } from '../../types/filters';

  let { filterService, allCourses }: { filterService: FilterService; allCourses: Course[] } =
    $props();

  let isCategoryMode = $state(false);
  let search = $state('');

  const allDepartments = $derived(
    filterService.getFilterOptions('department', allCourses) as string[]
  );

  const activeDepartments = $derived<string[]>(
    filterService.getCriteria<DepartmentFilterCriteria>('department')?.departments ?? []
  );

  type Item = { value: string; checked: boolean; indeterminate: boolean };

  // Either individual departments or one entry per category (with tri-state).
  const items = $derived.by<Item[]>(() => {
    if (isCategoryMode) {
      return CATEGORY_ORDER.filter((c) => c !== 'Other').map((category) => {
        const depts = allDepartments.filter((d) => getDepartmentCategory(d) === category);
        const selected = depts.filter((d) => activeDepartments.includes(d));
        const allSelected = depts.length > 0 && selected.length === depts.length;
        const someSelected = selected.length > 0;
        return {
          value: category,
          checked: allSelected || someSelected,
          indeterminate: someSelected && !allSelected,
        };
      });
    }
    return allDepartments.map((d) => ({
      value: d,
      checked: activeDepartments.includes(d),
      indeterminate: false,
    }));
  });

  const visibleItems = $derived.by<Item[]>(() => {
    const q = search.toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      isCategoryMode ? it.value.toLowerCase().includes(q) : departmentMatchesSearch(it.value, q)
    );
  });

  // Caller (visibleItems) only invokes this with a non-empty, already-lowercased
  // query, so no empty-query guard is needed here.
  function departmentMatchesSearch(dept: string, lq: string): boolean {
    if (dept.toLowerCase().includes(lq)) return true;
    return getDepartmentCategory(dept).toLowerCase().includes(lq);
  }

  // Expand the chosen values (categories → their departments) and write.
  function applyFromSelection(values: string[]): void {
    let departments: string[] = [];
    if (isCategoryMode) {
      values.forEach((category) => {
        departments.push(...allDepartments.filter((d) => getDepartmentCategory(d) === category));
      });
    } else {
      departments = values;
    }
    if (departments.length > 0) filterService.addFilter('department', { departments });
    else filterService.removeFilter('department');
  }

  function toggleItem(value: string, checked: boolean): void {
    const current = items.filter((it) => it.checked).map((it) => it.value);
    const next = checked
      ? [...new Set([...current, value])]
      : current.filter((v) => v !== value);
    applyFromSelection(next);
  }

  function selectAll(): void {
    applyFromSelection(items.map((it) => it.value));
  }

  function selectNone(): void {
    applyFromSelection([]);
  }

  // <input>.indeterminate is a property, not an attribute — set it imperatively.
  function indeterminate(node: HTMLInputElement, value: boolean) {
    node.indeterminate = value;
    return {
      update(v: boolean) {
        node.indeterminate = v;
      },
    };
  }
</script>

<FilterSection title="Departments">
  {#snippet actions()}
    <button class="filter-select-all" onclick={selectAll}>All</button>
    <button class="filter-select-none" onclick={selectNone}>None</button>
  {/snippet}
    <label class="filter-toggle-label">
      <input type="checkbox" class="filter-toggle" bind:checked={isCategoryMode} />
      <span class="filter-toggle-slider"></span>
      <span class="filter-toggle-text">Search by Credit Requirements</span>
    </label>
    <div class="filter-search-container">
      <TextField
        type="search"
        panel
        ariaLabel={isCategoryMode ? 'Search categories' : 'Search departments'}
        placeholder={isCategoryMode ? 'Search categories...' : 'Search departments...'}
        bind:value={search}
      />
    </div>
    <div class="filter-checkbox-grid">
      {#each visibleItems as item (item.value)}
        <label class="department-checkbox-label">
          <input
            type="checkbox"
            class="department-checkbox"
            checked={item.checked}
            use:indeterminate={item.indeterminate}
            onchange={(e) => toggleItem(item.value, e.currentTarget.checked)}
          />
          <span class="department-checkbox-text">{item.value}</span>
        </label>
      {/each}
    </div>
</FilterSection>
