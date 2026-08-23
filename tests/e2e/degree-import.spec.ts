import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Exercises the Degree page end to end: switch to the tab, import a (sanitized)
 * Academic Progress export, see it render, and confirm it survives a reload
 * (rehydrated from localStorage by DegreeImportService.load()).
 */

const fixture = fileURLToPath(
  new URL('../fixtures/academic-progress-sample.xlsx', import.meta.url),
);

test.beforeEach(async ({ page }) => {
  // Skip the first-visit welcome tutorial so it doesn't overlay the flow.
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
});

test('imports an Academic Progress file and persists it across reload', async ({
  page,
}) => {
  await page.goto('/');

  await page.click('#degree-tab');
  await expect(page.locator('.degree-dropzone')).toBeVisible();

  await page.setInputFiles('#degree-import-file', fixture);

  // Summary + requirement cards render from the parsed record.
  await expect(page.locator('.degree-summary-title')).toContainText(
    'Computer Science',
  );
  await expect(page.locator('.requirement-card').first()).toBeVisible();

  // Persisted: after a reload the record rehydrates without re-importing.
  await page.reload();
  await page.click('#degree-tab');
  await expect(page.locator('.degree-summary-title')).toContainText(
    'Computer Science',
  );
  await expect(page.locator('.degree-dropzone')).toHaveCount(0);
});

test('hides umbrella (degree-wide) requirements until toggled', async ({
  page,
}) => {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();

  // "Total Credits" / "Residency" are hidden by default.
  await expect(
    page.locator('.requirement-card-name', { hasText: 'Total Credits' }),
  ).toHaveCount(0);

  // The toggle reveals them.
  await page.locator('.degree-umbrella-toggle').click();
  await expect(
    page.locator('.requirement-card-name', { hasText: 'Total Credits' }),
  ).toBeVisible();
});

test('status filters are multi-select and collapse to All when all chosen', async ({
  page,
}) => {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();

  const cards = page.locator('.requirement-card');
  // Anchor the match: plain-string hasText is case-insensitive, so "Satisfied"
  // would otherwise also match "Not satisfied".
  const chip = (name: string) =>
    page.locator('.degree-filter-chip', { hasText: new RegExp('^' + name) });

  await expect(cards).toHaveCount(3); // All selected by default

  await chip('Not satisfied').click();
  await expect(cards).toHaveCount(1);

  await chip('In progress').click(); // multi-select: both statuses shown
  await expect(cards).toHaveCount(2);

  await chip('Satisfied').click(); // all three → collapse to All
  await expect(chip('All')).toHaveAttribute('aria-pressed', 'true');
  await expect(cards).toHaveCount(3);
});

test('builds a schedule from the planned courses and swaps to it', async ({
  page,
}) => {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
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

test('overlays the current schedule onto requirements and browses from an empty slot', async ({
  page,
}) => {
  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();

  // Build "Enrolled" so there's an active schedule with courses, then return to Degree.
  await page.locator('.degree-build-btn').click();
  await expect(page.locator('#schedule-page')).toBeVisible();
  await page.click('#degree-tab');

  // Toggle the non-destructive overlay → schedule tiles appear on the cards.
  await page.locator('.degree-check-btn').click();
  // The fixture's only schedule course sits under the Total Credits umbrella; reveal it.
  await page.locator('.degree-umbrella-toggle').click();
  await expect(
    page.locator('.requirement-course.is-schedule').first(),
  ).toBeVisible();

  // Clicking an empty slot filters the courses page and navigates there.
  await page.locator('.requirement-course-empty').first().click();
  await expect(page.locator('#planner-page')).toBeVisible();
});

test('clicking a course name opens its catalog entry on the classes page', async ({
  page,
}) => {
  page.on('dialog', d => d.dismiss()); // don't hang if a code can't be resolved

  await page.goto('/');
  await page.click('#degree-tab');
  await page.setInputFiles('#degree-import-file', fixture);
  await page.locator('.degree-summary-title').waitFor();

  // Build "Enrolled" + overlay so we have schedule tiles linked to real catalog courses.
  await page.locator('.degree-build-btn').click();
  await expect(page.locator('#schedule-page')).toBeVisible();
  await page.click('#degree-tab');
  await page.locator('.degree-check-btn').click();
  await page.locator('.degree-umbrella-toggle').click(); // schedule tile is under Total Credits

  // Clicking the code navigates to the classes page and highlights that course's entry.
  await page
    .locator('.requirement-course.is-schedule .requirement-course-link')
    .first()
    .click();
  await expect(page.locator('#planner-page')).toBeVisible();
  await expect(
    page.locator('#course-container [data-course-id].active'),
  ).toBeVisible();
});

test('keeps all pages mounted when switching to Degree', async ({ page }) => {
  await page.goto('/');
  await page.click('#degree-tab');
  // The planner and schedule regions remain in the DOM (display toggled, not torn down).
  await expect(page.locator('#planner-page')).toHaveCount(1);
  await expect(page.locator('#schedule-page')).toHaveCount(1);
  await expect(page.locator('#degree-page')).toBeVisible();
});
