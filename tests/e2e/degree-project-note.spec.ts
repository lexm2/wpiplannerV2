import { test, expect } from './fixtures';

/** The MQP and IQP aren't catalog sections, so a search for one says so. */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
  await page.goto('/');
  await expect(page.locator('[data-course-item]').first()).toBeVisible();
});

test('searching a degree project explains it above the results', async ({
  page,
}) => {
  const search = page.getByRole('textbox', { name: 'Search courses' });
  const note = page.locator('[data-degree-project-note]');

  await search.fill('Interactive Qualifying Project');
  await expect(note).toContainText('The IQP (Interactive Qualifying Project)');
  await expect(note).toContainText('named for it: ID 2050');
  await expect(page.locator('[data-course-item]').first()).toContainText(
    'ID2050',
  );

  await search.fill('MQP');
  await expect(note).toContainText('No catalog course is named for it');
  await expect(note).toHaveCount(1);

  await search.fill('calculus');
  await expect(note).toBeEmpty();
});
