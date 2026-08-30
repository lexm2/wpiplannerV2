import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // `browser` makes Svelte load its client runtime, so effects actually run.
  // The remaining conditions must stay listed: overriding with a bare
  // ['browser'] drops them and breaks resolution for deps like zod.
  resolve: { conditions: ['browser', 'import', 'module', 'default'] },
  test: {
    // flushSync and DOM-dependent rune internals need a DOM.
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});
