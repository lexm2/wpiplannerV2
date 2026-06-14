import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import { FilterState } from './FilterState';
import { watch } from '../../svelte/reactivity.svelte';

/**
 * Validates the Phase 1 wiring end-to-end: FilterState mutations flow through
 * its backing SvelteMap and re-run a `watch` effect — the same path the
 * vanilla controllers now use instead of the deleted listener system.
 */
describe('FilterState reactivity', () => {
    it('re-runs a watcher on add / update / remove / clear, skipping the initial run', () => {
        const cleanup = $effect.root(() => {
            const fs = new FilterState();
            let runs = 0;
            let lastCount = -1;

            watch(
                () => fs.getActiveFilters(),
                () => {
                    runs += 1;
                    lastCount = fs.getFilterCount();
                },
            );
            flushSync();
            expect(runs).toBe(0); // watch skips the initial run

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

            watch(
                () => fs.getActiveFilters(),
                () => {
                    seenDisplay = fs.getActiveFilters().find(f => f.id === 'dept')?.displayValue ?? '';
                },
            );
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
