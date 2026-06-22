import { defineConfig, devices } from '@playwright/test';

// E2E config. Firefox is the only Playwright browser cached locally, so we pin
// to it to avoid a Chromium download. The dev server is reused if already up.
export default defineConfig({
    testDir: './tests/e2e',
    timeout: 120_000,
    fullyParallel: false,
    retries: 0,
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
