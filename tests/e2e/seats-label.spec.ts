import { test, expect } from './fixtures';

/**
 * An over-enrolled section arrives with a negative seatsAvailable (QA saw
 * AB1531 A01 at -1 of 20). The course description must call it full rather
 * than print "Seats: -1/20 available".
 */
test('course description shows an over-enrolled section as full', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('wpi_visited', '1'));
  await page.goto('/');
  await page.waitForFunction(
    () =>
      (window as any).services?.courseDataService?.getAllDepartments()?.length >
      0,
    undefined,
    { timeout: 30000 },
  );

  // Force the first listed course's sections over capacity, whatever the live
  // data says today, before its description is first rendered.
  const courseId = await page.evaluate(() => {
    const el = document.querySelector('[data-course-item]')!;
    const id = el.getAttribute('data-course-id')!;
    const course = (window as any).services.courseDataService
      .getAllDepartments()
      .flatMap((d: any) => d.courses)
      .find((c: any) => c.id === id);
    const sections = [
      ...(course.lectures ?? []).flatMap((l: any) => [
        l.section,
        ...l.compatibleDiscussions,
        ...l.compatibleLabs,
      ]),
      ...(course.standaloneLabs ?? []),
    ];
    for (const s of sections) {
      s.seats = 20;
      s.seatsAvailable = -1;
    }
    return id;
  });

  await page.click(`[data-course-item][data-course-id="${courseId}"]`);
  const seats = page.locator('#course-description').getByText(/Seats:/);
  await expect(seats.first()).toBeVisible();
  const texts = await seats.allInnerTexts();
  for (const text of texts) {
    expect(text).not.toMatch(/-\d/);
    expect(text).toContain('Full');
  }
});
