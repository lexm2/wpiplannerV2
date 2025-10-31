/**
 * Converter configuration file
 * Update these values for each academic year
 */

import { ConverterConfig } from './converter/ConverterConfig.js';

export const converterConfig: ConverterConfig = {
    // Academic Period
    // Fall term includes A and B terms
    fallYear: 2025,

    // Spring term includes C and D terms
    springYear: 2026,

    // UI Configuration
    showOldLink: false,

    // Special Courses
    // These courses will display full section names and use Course_Description
    specialCourses: [
        'HU 3900',  // Humanities Capstone
        'HU 3910',  // Humanities Capstone
        'ID 2050',  // Interdisciplinary
        'WPE 1099', // Wellness & PE
        'WPE 1699'  // Wellness & PE
    ],

    // Special Sections
    // Section names containing these substrings are treated as special
    specialSections: [
        'GPS:',      // Graduate Project Sponsorship
        '- ST:',     // Special Topics
        '- ST: -',   // Special Topics (variant)
        '- SP:',     // Special
        '- AT:',     // Advanced Topics
        '- Topics In',
        'History:',
        'In Psychological Science:'
    ],

    // Section Number Appendices
    // Used to identify and parse section number suffixes
    sectionNumberAppendices: [
        '-Quiz',
        '-Multipurpose',
        '-Y',
        '-ACL'
    ]
};
