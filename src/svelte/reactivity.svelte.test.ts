import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import { subscribe, watch } from './reactivity.svelte';

describe('subscribe', () => {
    it('runs immediately and re-runs when a read rune changes', () => {
        const cleanup = $effect.root(() => {
            let value = $state(0);
            const seen: number[] = [];

            const dispose = subscribe(() => {
                seen.push(value);
            });
            flushSync(); // flush the initial effect run

            expect(seen).toEqual([0]);

            value = 1;
            flushSync();
            value = 2;
            flushSync();

            expect(seen).toEqual([0, 1, 2]);
            dispose();
        });
        cleanup();
    });

    it('stops re-running after dispose()', () => {
        const cleanup = $effect.root(() => {
            let value = $state(0);
            const seen: number[] = [];

            const dispose = subscribe(() => {
                seen.push(value);
            });
            flushSync();
            dispose();

            value = 99;
            flushSync();

            expect(seen).toEqual([0]); // no further runs after dispose
        });
        cleanup();
    });
});

describe('watch', () => {
    it('skips the initial run and fires only on change', () => {
        const cleanup = $effect.root(() => {
            let value = $state(0);
            const seen: number[] = [];

            const dispose = watch(
                () => value, // tracked dependency
                () => seen.push(value),
            );
            flushSync();

            expect(seen).toEqual([]); // initial run skipped

            value = 1;
            flushSync();
            value = 2;
            flushSync();

            expect(seen).toEqual([1, 2]);
            dispose();
        });
        cleanup();
    });

    it('stops firing after dispose()', () => {
        const cleanup = $effect.root(() => {
            let value = $state(0);
            const seen: number[] = [];

            const dispose = watch(() => value, () => seen.push(value));
            flushSync();
            value = 1;
            flushSync();
            dispose();

            value = 2;
            flushSync();

            expect(seen).toEqual([1]);
        });
        cleanup();
    });
});
