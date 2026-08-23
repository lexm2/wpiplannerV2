import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // Use the `browser` entry points so Svelte loads its CLIENT runtime (effects
  // actually run) instead of the SSR build. We list the standard conditions
  // alongside `browser` so other deps (e.g. zod) still resolve their `import`
  // entry - a bare `['browser']` override drops those and breaks resolution.
  resolve: { conditions: ['browser', 'import', 'module', 'default'] },
  test: {
    // flushSync + DOM-dependent rune internals need a DOM-like environment.
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});
