import { describe, it, expect } from 'vitest';
import { flushSync, untrack } from 'svelte';
import { FilterState } from '../../src/core/filtering/FilterState';

/**
 * Validates the reactive wiring end-to-end: FilterState mutations flow through
 * its backing SvelteMap and re-run a Svelte effect - the same path the App.svelte
 * effects now use directly (the migration's reactivity bridge has been removed).
 *
 * `watchActiveFilters` reproduces the old bridge `watch(deps, run)` semantics
 * locally: it tracks getActiveFilters() and skips the initial run, so `run`
 * fires only on subsequent changes.
 */
function watchActiveFilters(fs: FilterState, run: () => void): void {
  let first = true;
  $effect(() => {
    fs.getActiveFilters(); // establish/maintain dependency every run
    if (first) {
      first = false;
      return;
    }
    untrack(run);
  });
}

describe('FilterState reactivity', () => {
  it('re-runs a watcher on add / update / remove / clear, skipping the initial run', () => {
    const cleanup = $effect.root(() => {
      const fs = new FilterState();
      let runs = 0;
      let lastCount = -1;

      watchActiveFilters(fs, () => {
        runs += 1;
        lastCount = fs.getFilterCount();
      });
      flushSync();
      expect(runs).toBe(0); // initial run is skipped

      fs.addFilter('dept', 'Department', { departments: ['CS'] }, 'CS');
      flushSync();
      expect(runs).toBe(1);
      expect(lastCount).toBe(1);

      fs.updateFilter('dept', { departments: ['CS', 'MA'] }, 'CS, MA');
      flushSync();
      expect(runs).toBe(2);

      fs.addFilter('term', 'Term', { terms: ['A'] }, 'A');
      flushSync();
      expect(runs).toBe(3);
      expect(lastCount).toBe(2);

      fs.removeFilter('dept');
      flushSync();
      expect(runs).toBe(4);
      expect(lastCount).toBe(1);

      fs.clearFilters();
      flushSync();
      expect(runs).toBe(5);
      expect(lastCount).toBe(0);
    });
    cleanup();
  });

  it('reflects criteria updates through getActiveFilters()', () => {
    const cleanup = $effect.root(() => {
      const fs = new FilterState();
      let seenDisplay = '';

      watchActiveFilters(fs, () => {
        seenDisplay =
          fs.getActiveFilters().find(f => f.id === 'dept')?.displayValue ?? '';
      });
      flushSync();

      fs.addFilter('dept', 'Department', { departments: ['CS'] }, 'CS');
      flushSync();
      expect(seenDisplay).toBe('CS');

      fs.updateFilter('dept', { departments: ['CS', 'MA'] }, 'CS, MA');
      flushSync();
      expect(seenDisplay).toBe('CS, MA');
    });
    cleanup();
  });
});
