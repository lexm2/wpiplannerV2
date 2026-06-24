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

    // Swaps to a new active "Enrolled" schedule and lands on the schedule page.
    await expect(page.locator('#schedule-picker-label')).toHaveText('Enrolled');
    await expect(page.locator('#schedule-page')).toBeVisible();
    // The planned course was added to the schedule (shown in the schedule sidebar).
    await expect(page.locator('#schedule-sidebar-content')).toContainText('2022');
});

test('overlays the current schedule onto requirements and browses from an empty slot', async ({ page }) => {
    await page.goto('/');
    await page.click('#degree-tab');
    await page.setInputFiles('.degree-file-input', fixture);
    await page.locator('.degree-summary-title').waitFor();

    // Build "Enrolled" so there's an active schedule with courses, then return to Degree.
    await page.locator('.degree-build-btn').click();
    await expect(page.locator('#schedule-page')).toBeVisible();
    await page.click('#degree-tab');

    // Toggle the non-destructive overlay → schedule tiles appear on the cards.
    await page.locator('.degree-check-btn').click();
    await expect(page.locator('.requirement-course.is-schedule').first()).toBeVisible();

    // Clicking an empty slot filters the courses page and navigates there.
    await page.locator('.requirement-course-empty').first().click();
    await expect(page.locator('#planner-page')).toBeVisible();
});

test('clicking a course name opens its catalog entry on the classes page', async ({ page }) => {
    page.on('dialog', (d) => d.dismiss()); // don't hang if a code can't be resolved

    await page.goto('/');
    await page.click('#degree-tab');
    await page.setInputFiles('.degree-file-input', fixture);
    await page.locator('.degree-summary-title').waitFor();

    // Build "Enrolled" + overlay so we have schedule tiles linked to real catalog courses.
    await page.locator('.degree-build-btn').click();
    await expect(page.locator('#schedule-page')).toBeVisible();
    await page.click('#degree-tab');
    await page.locator('.degree-check-btn').click();

    // Clicking the code navigates to the classes page and highlights that course's entry.
    await page.locator('.requirement-course.is-schedule .requirement-course-link').first().click();
    await expect(page.locator('#planner-page')).toBeVisible();
    await expect(page.locator('#course-container [data-course-id].active')).toBeVisible();
});

test('keeps all pages mounted when switching to Degree', async ({ page }) => {
    await page.goto('/');
    await page.click('#degree-tab');
    // The planner and schedule regions remain in the DOM (display toggled, not torn down).
    await expect(page.locator('#planner-page')).toHaveCount(1);
    await expect(page.locator('#schedule-page')).toHaveCount(1);
    await expect(page.locator('#degree-page')).toBeVisible();
});
