import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Shared constants in index.html
const HTML_CONSTANTS: Record<string, string> = {
  APP_TITLE: 'WPI Course Planner',
  APP_DESCRIPTION:
    'Unofficial course and schedule planner for WPI (Worcester Polytechnic Institute) students.',
  APP_URL: 'https://lexm2.github.io/wpiplannerV2/',
  APP_AUTHOR: 'Lex',
};

const htmlConstants = (): Plugin => ({
  name: 'html-constants',
  transformIndexHtml: html =>
    html.replace(
      /%(\w+)%/g,
      (token, key: string) => HTML_CONSTANTS[key] ?? token,
    ),
});

export default defineConfig({
  base: '/wpiplannerV2/',
  plugins: [svelte(), htmlConstants()],
  publicDir: 'public',
  worker: {
    format: 'es',
    plugins: () => [],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
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
