/**
 * Configuration for the Workday to Planner converter
 */

export interface ConverterConfig {
  specialCourses: string[];
  specialSections: string[];
  sectionNumberAppendices: string[];
}

/**
 * Validates that an offering period is a recognized academic term format.
 * Accepts any year - e.g. "2025 Fall A Term", "2026 Spring C Term", "2026 Fall Semester".
 */
export function isValidAcademicPeriod(
  offeringPeriod: string,
  courseSection: string,
  instructionalFormat: string,
): boolean {
  const validPattern =
    /^\d{4} (Fall [AB] Term|Spring [CD] Term|Fall Semester|Spring Semester)$/;
  if (!validPattern.test(offeringPeriod)) {
    return false;
  }

  if (
    courseSection.includes('Interest List') &&
    instructionalFormat !== 'Lecture'
  ) {
    return false;
  }

  return true;
}
