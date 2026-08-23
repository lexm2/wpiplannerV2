import { SvelteMap } from 'svelte/reactivity';
import { ActiveFilter, FilterCriteria } from '../../types/filters';

/**
 * Manages active filters as reactive state.
 *
 * Backed by a `SvelteMap`, so every query method below (`getActiveFilters`,
 * `hasFilter`, `getFilterCount`, …) is a reactive read: consumers read them in a
 * component or an `$effect` and re-run automatically when filters change. There
 * is no separate listener system - runes are the reactivity mechanism.
 */
export class FilterState {
  private activeFilters = new SvelteMap<string, ActiveFilter>();

  addFilter(
    id: string,
    name: string,
    criteria: unknown,
    displayValue: string,
  ): void {
    const filter: ActiveFilter = {
      id,
      name,
      criteria,
      displayValue,
    };

    this.activeFilters.set(id, filter);
  }

  removeFilter(id: string): boolean {
    return this.activeFilters.delete(id);
  }

  updateFilter(id: string, criteria: unknown, displayValue: string): boolean {
    const existing = this.activeFilters.get(id);
    if (existing) {
      // Re-set a new object so the SvelteMap registers the change
      // (mutating the stored value in place would not be reactive).
      this.activeFilters.set(id, { ...existing, criteria, displayValue });
      return true;
    }
    return false;
  }

  clearFilters(): void {
    this.activeFilters.clear();
  }

  hasFilter(id: string): boolean {
    return this.activeFilters.has(id);
  }

  getFilter(id: string): ActiveFilter | undefined {
    return this.activeFilters.get(id);
  }

  getActiveFilters(): ActiveFilter[] {
    return Array.from(this.activeFilters.values());
  }

  getFilterCriteria(): FilterCriteria {
    const criteria: FilterCriteria = {};
    for (const [id, filter] of this.activeFilters) {
      criteria[id] = filter.criteria;
    }
    return criteria;
  }

  getActiveFilterIds(): string[] {
    return Array.from(this.activeFilters.keys());
  }

  getFilterCount(): number {
    return this.activeFilters.size;
  }

  isEmpty(): boolean {
    return this.activeFilters.size === 0;
  }
}
