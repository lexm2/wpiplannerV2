/**
 * Configuration for the Workday to Planner converter
 */

export interface ConverterConfig {
  specialCourses: string[];
  specialSections: string[];
  sectionNumberAppendices: string[];
}

export const DEFAULT_CONFIG: ConverterConfig = {
  specialCourses: ['HU 3900', 'HU 3910', 'ID 2050', 'WPE 1099', 'WPE 1699'],
  specialSections: [
    'GPS:',
    '- ST:',
    '- ST: -',
    '- SP:',
    '- AT:',
    '- Topics In',
    'History:',
    'In Psychological Science:',
  ],
  sectionNumberAppendices: ['-Quiz', '-Multipurpose', '-Y', '-ACL'],
};

/**
 * Validates that an offering period is a recognized academic term format.
 * Accepts any year - e.g. "2025 Fall A Term", "2026 Spring C Term", "2026 Fall Semester".
 */
export function isValidAcademicPeriod(
  offeringPeriod: string,
  courseSection: string,
  instructionalFormat: string,
  _config: ConverterConfig,
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
