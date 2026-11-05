/**
 * A future year counts as published once it lists at least this share of
 * the current year's courses. WPI's full schedule runs to well over a
 * thousand courses; a year with a handful holds only early entries.
 */
const PUBLISHED_SHARE = 0.25;

/** Whether a future year with `courseCount` courses is published, given the current year's count. */
export function isYearPublished(
  courseCount: number,
  currentYearCount: number,
): boolean {
  return courseCount > 0 && courseCount >= currentYearCount * PUBLISHED_SHARE;
}
