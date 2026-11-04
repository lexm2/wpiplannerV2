import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
});

test('undergrad level sub-bar narrows the course list', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );
  await page.click('#filter-btn');

  const sub = page.getByRole('group', { name: 'Undergraduate level' });
  await expect(sub).toHaveCount(0);

  const criteria = () =>
    page.evaluate(() =>
      (window as any).services.filterService.getCriteria('graduateLevel'),
    );

  await page.getByRole('button', { name: 'Undergrad', exact: true }).click();
  await expect(sub).toBeVisible();
  expect(await criteria()).toEqual({ level: 'undergraduate' });

  await sub.getByRole('button', { name: '3000', exact: true }).click();
  await expect.poll(criteria).toEqual({
    level: 'undergraduate',
    undergradLevel: 3000,
  });

  const cards = page.locator('#course-container [data-course-id]');
  await expect(cards.first()).toBeVisible();
  await expect
    .poll(async () => {
      const ids = await cards.evaluateAll(els =>
        els.map(e => e.getAttribute('data-course-id') ?? ''),
      );
      return ids.length > 0 && ids.every(id => /^[A-Z]+-3/.test(id));
    })
    .toBe(true);

  await page.getByRole('button', { name: 'Graduate', exact: true }).click();
  await expect(sub).toHaveCount(0);
  expect(await criteria()).toEqual({ level: 'graduate' });
});

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  test('both level bars fit without horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () =>
        (window as any).services?.courseDataService?.getAllDepartments()
          ?.length > 0,
      undefined,
      { timeout: 30000 },
    );
    await page.click('#filter-btn');
    await page.getByRole('button', { name: 'Undergrad', exact: true }).click();
    const sub = page.getByRole('group', { name: 'Undergraduate level' });
    await sub.getByRole('button', { name: '3000', exact: true }).click();
    await page.waitForTimeout(500);

    for (const label of ['All', '1000', '2000', '3000', '4000']) {
      const btn = sub.getByRole('button', { name: label, exact: true });
      await expect(btn).toBeVisible();
      const box = (await btn.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(32);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }

    // Both bars and the section holding them stay inside their boxes.
    const overflow = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.filter-modal-dialog .filter-segmented-control',
        ),
      ].map(el => el.scrollWidth - el.clientWidth),
    );
    expect(overflow.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...overflow)).toBeLessThanOrEqual(0);
  });
});
