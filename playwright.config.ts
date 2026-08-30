import { defineConfig, devices } from '@playwright/test';

// Firefox only: it is the one Playwright browser cached locally, so this
// avoids a Chromium download.
export default defineConfig({
  testDir: './tests/e2e',
  // Underscore-prefixed specs are gitignored local scratch files.
  testIgnore: '**/_*.spec.ts',
  timeout: 120_000,
  fullyParallel: false,
  // fullyParallel:false only serialises within a file, so one worker is what
  // stops spec files racing each other on the shared dev server. The timed
  // tutorial-highlight steps fail under that contention.
  workers: 1,
  // tutorial-highlight is timing-sensitive and occasionally flakes on CI.
  // Locally, let the failure surface.
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000/wpiplannerV2/',
    headless: true,
  },
  projects: [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }],
  webServer: {
    command: 'bun ./node_modules/vite/bin/vite.js --port 3000',
    url: 'http://localhost:3000/wpiplannerV2/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
