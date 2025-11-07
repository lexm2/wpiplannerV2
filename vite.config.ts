import { defineConfig } from 'vite'

export default defineConfig({
  base: '/wpiplannerV2/',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020'
  },
  server: {
    port: 3000
  }
})