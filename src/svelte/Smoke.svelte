<script lang="ts">
  // Smoke test: proves the Svelte + TypeScript toolchain compiles.
  // Not imported by the live app (main.ts) — safe to delete/replace when
  // the first real component lands.
  let count: number = $state(0);
  const increment = (): void => {
    count += 1;
  };
</script>

<button onclick={increment}>
  Svelte is wired up — clicked {count} time{count === 1 ? '' : 's'}
</button>

<style>
  button {
    font: inherit;
  }
</style>
