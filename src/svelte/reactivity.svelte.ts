/**
 * Migration bridge primitive — pure Svelte reactivity, not a custom event system.
 *
 * Lets not-yet-migrated vanilla `.ts` code react to rune state without a
 * hand-rolled listener system: `run` re-executes whenever any rune it reads
 * changes. Returns a dispose function that tears down the effect.
 *
 * This is temporary scaffolding: as each consumer becomes a Svelte component
 * (which gets reactivity for free), its `subscribe(...)` call is deleted. When
 * the last consumer is gone, this helper goes too.
 *
 * @example
 *   this.dispose = subscribe(() => { readSomeRune(); this.render(); });
 *   // later, on teardown:
 *   this.dispose();
 */
export function subscribe(run: () => void): () => void {
    return $effect.root(() => {
        $effect(run);
    });
}

/**
 * Like {@link subscribe}, but SKIPS the initial run — `run` fires only when a
 * rune read by `deps` changes afterward. This mirrors the old listener
 * semantics ("notify on change", not at registration) for vanilla consumers
 * whose refresh callbacks aren't safe to run eagerly at wire-up time.
 *
 * `deps` must synchronously read the reactive state to track; its return value
 * is ignored. Returns a dispose function.
 *
 * @example
 *   this.dispose = watch(
 *     () => filterService.getActiveFilters(), // tracked
 *     () => this.refresh(),                    // runs on change only
 *   );
 */
export function watch(deps: () => unknown, run: () => void): () => void {
    let first = true;
    return $effect.root(() => {
        $effect(() => {
            deps(); // establish/maintain dependencies every run
            if (first) {
                first = false;
                return;
            }
            run();
        });
    });
}
