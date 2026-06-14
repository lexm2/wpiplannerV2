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
