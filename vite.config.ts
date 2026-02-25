import { defineConfig } from 'vite'

export default defineConfig({
  base: '/wpiplannerV2/',
  publicDir: 'public',
  worker: {
    format: 'es',
    plugins: () => []
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          // Microsoft/Azure libraries (largest dependencies)
          'vendor-microsoft': [
            '@azure/msal-browser',
            '@microsoft/microsoft-graph-client'
          ],
          // Other vendor libraries
          'vendor-utils': [
            'lz-string',
            'rrule',
            'zod'
          ],
          'worker-storage': ['src/workers/storage.worker.ts']
        }
      }
    }
  },
  server: {
    port: 3000
  }
})
