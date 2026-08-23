import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: '/wpiplannerV2/',
  plugins: [svelte()],
  publicDir: 'public',
  worker: {
    format: 'es',
    plugins: () => [],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          // Other vendor libraries
          'vendor-utils': ['lz-string', 'rrule', 'zod'],
          'worker-storage': ['src/workers/storage.worker.ts'],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
});
