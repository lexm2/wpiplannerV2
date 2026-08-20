import { defineConfig, devices } from '@playwright/test';

// E2E config. Firefox is the only Playwright browser cached locally, so we pin
// to it to avoid a Chromium download. The dev server is reused if already up.
export default defineConfig({
    testDir: './tests/e2e',
    // Underscore-prefixed specs are local scratch files (gitignored, personal
    // absolute paths). Without this they'd still be globbed on a local run.
    testIgnore: '**/_*.spec.ts',
    timeout: 120_000,
    fullyParallel: false,
    // One worker: fullyParallel:false only serialises tests WITHIN a file, so
    // separate spec files would still run concurrently against the single shared
    // dev server. tutorial-highlight walks 39 timed steps and fails under that
    // contention. Also keeps CI (variable core count) deterministic.
    workers: 1,
    // One retry in CI only. tutorial-highlight walks 39 timed steps against a
    // shared dev server and occasionally loses that race late in a full run;
    // locally we want the failure surfaced immediately, in CI we do not want a
    // flake to block a PR.
    retries: process.env.CI ? 1 : 0,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:3000/wpiplannerV2/',
        headless: true,
    },
    projects: [
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    ],
    webServer: {
        command: 'bun ./node_modules/vite/bin/vite.js --port 3000',
        url: 'http://localhost:3000/wpiplannerV2/',
        reuseExistingServer: true,
        timeout: 120_000,
    },
});
