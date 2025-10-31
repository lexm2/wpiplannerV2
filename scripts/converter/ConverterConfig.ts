/**
 * Configuration for the Workday to Planner converter
 * Corresponds to planner.properties in the Java version
 */

export interface ConverterConfig {
    fallYear: number;
    springYear: number;
    showOldLink: boolean;
    specialCourses: string[];
    specialSections: string[];
    sectionNumberAppendices: string[];
}

/**
 * Default converter configuration
 * Update these values for each academic year
 */
export const DEFAULT_CONFIG: ConverterConfig = {
    // Academic Period
    fallYear: 2025,    // Fall term year (A, B terms)
    springYear: 2026,  // Spring term year (C, D terms)

    // UI Configuration
    showOldLink: false,

    // Special Courses (full section name displayed)
    specialCourses: [
        'HU 3900',
        'HU 3910',
        'ID 2050',
        'WPE 1099',
        'WPE 1699'
    ],

    // Special Sections (identified by substrings)
    specialSections: [
        'GPS:',
        '- ST:',
        '- ST: -',
        '- SP:',
        '- AT:',
        '- Topics In',
        'History:',
        'In Psychological Science:'
    ],

    // Section Number Appendices (for parsing)
    sectionNumberAppendices: [
        '-Quiz',
        '-Multipurpose',
        '-Y',
        '-ACL'
    ]
};

/**
 * Validates academic period against configured years
 */
export function isValidAcademicPeriod(
    offeringPeriod: string,
    courseSection: string,
    instructionalFormat: string,
    config: ConverterConfig
): boolean {
    // Valid periods
    const validPeriods = [
        `${config.fallYear} Fall A Term`,
        `${config.fallYear} Fall B Term`,
        `${config.springYear} Spring C Term`,
        `${config.springYear} Spring D Term`,
        `${config.fallYear} Fall Semester`,
        `${config.springYear} Spring Semester`
    ];

    if (!validPeriods.includes(offeringPeriod)) {
        return false;
    }

    // Exception: Interest List sections with non-Lecture types are excluded
    if (courseSection.includes('Interest List') && instructionalFormat !== 'Lecture') {
        return false;
    }

    return true;
}
