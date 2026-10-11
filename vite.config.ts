import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { AtRule as AtRule_, Node, Plugin as PostcssPlugin } from 'postcss';

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

// Touch screens keep :hover on whatever was tapped last, so a hover style stays
// stuck on until the next tap elsewhere. Every :hover selector (stylesheets and
// component styles alike) is moved into @media (hover: hover), which only a
// real pointer matches; the rest of its selector list stays where it was.
const hoverOnlyWithPointer: PostcssPlugin = {
  postcssPlugin: 'hover-only-with-pointer',
  Rule(rule, { AtRule }) {
    if (!rule.selector.includes(':hover')) return;
    for (let p: Node | undefined = rule.parent; p; p = p.parent) {
      if (p.type === 'atrule' && /hover:\s*hover/.test((p as AtRule_).params))
        return;
    }
    const hover = rule.selectors.filter(s => s.includes(':hover'));
    const rest = rule.selectors.filter(s => !s.includes(':hover'));
    const media = new AtRule({ name: 'media', params: '(hover: hover)' });
    media.append(rule.clone({ selectors: hover }));
    rule.after(media);
    if (rest.length > 0) rule.selectors = rest;
    else rule.remove();
  },
};

export default defineConfig({
  base: '/wpiplannerV2/',
  plugins: [svelte(), htmlConstants()],
  css: {
    postcss: { plugins: [hoverOnlyWithPointer] },
  },
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
