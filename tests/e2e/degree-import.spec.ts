import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Exercises the Degree page end to end: switch to the tab, import a (sanitized)
 * Academic Progress export, see it render, and confirm it survives a reload
 * (rehydrated from localStorage by DegreeImportService.load()).
 */

const fixture = fileURLToPath(new URL('../fixtures/academic-progress-sample.xlsx', import.meta.url));

test.beforeEach(async ({ page }) => {
    // Skip the first-visit welcome tutorial so it doesn't overlay the flow.
    await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
});

test('imports an Academic Progress file and persists it across reload', async ({ page }) => {
    await page.goto('/');

    await page.click('#degree-tab');
    await expect(page.locator('.degree-dropzone')).toBeVisible();

    await page.setInputFiles('.degree-file-input', fixture);

    // Summary + requirement cards render from the parsed record.
    await expect(page.locator('.degree-summary-title')).toContainText('Computer Science');
    await expect(page.locator('.requirement-card').first()).toBeVisible();

    // Persisted: after a reload the record rehydrates without re-importing.
    await page.reload();
    await page.click('#degree-tab');
    await expect(page.locator('.degree-summary-title')).toContainText('Computer Science');
    await expect(page.locator('.degree-dropzone')).toHaveCount(0);
});

test('builds a schedule from the planned courses and swaps to it', async ({ page }) => {
    await page.goto('/');
    await page.click('#degree-tab');
    await page.setInputFiles('.degree-file-input', fixture);
    await page.locator('.degree-summary-title').waitFor();

    // The fixture has one planned (in-progress) course → the build button appears.
    const buildBtn = page.locator('.degree-build-btn');
    await expect(buildBtn).toContainText('planned');
    await buildBtn.click();

    // Swaps to a new active "Planned Courses" schedule and lands on the schedule page.
    await expect(page.locator('#schedule-picker-label')).toHaveText('Planned Courses');
    await expect(page.locator('#schedule-page')).toBeVisible();
    // The planned course was added to the schedule (shown in the schedule sidebar).
    await expect(page.locator('#schedule-sidebar-content')).toContainText('2022');
});

test('keeps all pages mounted when switching to Degree', async ({ page }) => {
    await page.goto('/');
    await page.click('#degree-tab');
    // The planner and schedule regions remain in the DOM (display toggled, not torn down).
    await expect(page.locator('#planner-page')).toHaveCount(1);
    await expect(page.locator('#schedule-page')).toHaveCount(1);
    await expect(page.locator('#degree-page')).toBeVisible();
});
