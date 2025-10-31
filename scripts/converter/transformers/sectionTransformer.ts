/**
 * Transforms Workday section data into PlannerSection objects
 */

import { WorkdaySection } from '../types/workdayTypes.js';
import { PlannerSection, PlannerPeriod } from '../types/outputTypes.js';
import { parseSectionDetails } from '../utils/timeParser.js';
import { sanitizeHTML } from '../utils/htmlSanitizer.js';
import { ConverterConfig } from '../ConverterConfig.js';

export interface CategorizedSections {
    lectures: PlannerSection[];
    discussions: PlannerSection[];
    labs: PlannerSection[];
    other: PlannerSection[];
}

/**
 * Transforms a Workday section into a PlannerSection
 */
export function transformSection(
    workdaySection: WorkdaySection,
    config: ConverterConfig
): PlannerSection | null {
    // Extract basic section information
    const courseSectionFull = workdaySection.Course_Section;
    const instructionalFormat = workdaySection.Instructional_Format;

    // Extract department and course number
    const dashIndex = courseSectionFull.indexOf('-');
    const subjectAndNumber = courseSectionFull.substring(0, dashIndex);

    // Extract section number
    const sectionNumber = extractSectionNumber(courseSectionFull, subjectAndNumber, config);

    // Check if this is a special section (GPS, Interest List, etc.)
    const isGPS = isSpecialSection(courseSectionFull, subjectAndNumber, config);
    const isInterestList = courseSectionFull.includes('Interest List');

    // Extract CRN from reference ID
    const referenceID = workdaySection.cour_sec_def_referenceID;
    const crn = parseInt(referenceID.substring(28, 34));

    // Parse enrollment data
    const enrolledCapacity = workdaySection.Enrolled_Capacity;
    const [enrolled, capacity] = enrolledCapacity.split('/').map(s => parseInt(s.trim()));
    const seatsAvailable = capacity - enrolled;

    const waitlistCapacity = workdaySection.Waitlist_Waitlist_Capacity;
    const [waitlistActual, waitlistMax] = waitlistCapacity.split('/').map(s => parseInt(s.trim()));

    // Get cluster ID (if any)
    const clusterId = workdaySection.CF_LRV_Cluster_Ref_ID || null;
    const note = isInterestList ? 'IntList' : (clusterId || null);

    // Get description (section-specific)
    const description = sanitizeHTML(workdaySection.Course_Section_Description);

    // Compute term from section number
    const computedTerm = extractTermLetter(sectionNumber);

    // Parse meeting patterns
    const sectionDetails = workdaySection.Section_Details || '';
    const meetingPatterns = parseSectionDetails(sectionDetails);

    // Get professor info
    let professor = workdaySection.Instructors || 'Not Assigned';
    if (!professor || professor.trim() === '') {
        professor = isInterestList ? 'N/A' : 'Not Assigned';
    }

    // Normalize type (Laboratory → Lab)
    const type = instructionalFormat === 'Laboratory' ? 'Lab' : instructionalFormat;

    // Determine part of term
    const term = workdaySection.Starting_Academic_Period_Type;
    let partOfTerm = term;
    if (term === 'Fall') {
        partOfTerm = 'A Term, B Term';
    } else if (term === 'Spring') {
        partOfTerm = 'C Term, D Term';
    }

    // Create periods from meeting patterns
    const periods: PlannerPeriod[] = meetingPatterns.map(pattern => ({
        type: type,
        professor: professor,
        start_time: pattern.startTime,
        end_time: pattern.endTime,
        location: pattern.location,
        building: '', // Workday doesn't separate building
        room: pattern.location,
        seats: capacity,
        seats_available: seatsAvailable,
        actual_waitlist: waitlistActual,
        max_waitlist: waitlistMax,
        specific_section: sectionNumber,
        days: pattern.days
    }));

    return {
        crn,
        number: sectionNumber,
        seats: capacity,
        seats_available: seatsAvailable,
        actual_waitlist: waitlistActual,
        max_waitlist: waitlistMax,
        note,
        description,
        term: '202201', // Fixed term code (legacy)
        computedTerm,
        is_gps: isGPS,
        is_interest_list: isInterestList,
        periods
    };
}

/**
 * Extracts section number from full course section string
 * Handles various formats: standard, GPS, Interest List, appendices
 */
function extractSectionNumber(
    courseSectionFull: string,
    subjectAndNumber: string,
    config: ConverterConfig
): string {
    // Check for appendices (e.g., "A01-Quiz")
    const hasAppendix = config.sectionNumberAppendices.some(
        appendix => courseSectionFull.includes(appendix)
    );

    if (hasAppendix) {
        // Extract: "CS 1101-A01-Quiz" → "A01"
        const dashIndex = courseSectionFull.indexOf('-');
        const secondDashIndex = courseSectionFull.indexOf('-', dashIndex + 6);
        return courseSectionFull.substring(dashIndex + 1, secondDashIndex - 1);
    }

    // Check for Interest List
    if (courseSectionFull.includes('Interest List')) {
        const term = courseSectionFull.includes('Fall') ? 'Fall' :
                     courseSectionFull.includes('Spring') ? 'Spring' : 'A Term';
        return `Interest List-${term}`;
    }

    // Check for special sections (GPS, Special Topics)
    if (isSpecialSection(courseSectionFull, subjectAndNumber, config)) {
        // Keep full section name: "GPS: Machine Learning"
        const dashIndex = courseSectionFull.indexOf('-');
        return courseSectionFull.substring(dashIndex + 1).trim();
    }

    // Standard section: "CS 1101-A01 - Intro" → "A01"
    const dashIndex = courseSectionFull.indexOf('-');
    const secondDashIndex = courseSectionFull.indexOf('-', dashIndex + 1);

    if (secondDashIndex === -1) {
        // No second dash, take everything after first dash
        return courseSectionFull.substring(dashIndex + 1).trim();
    }

    let sectionNumber = courseSectionFull.substring(dashIndex + 1, secondDashIndex - 1).trim();

    // Remove parenthetical suffixes: "A01 (Honors)" → "A01"
    const parenIndex = sectionNumber.indexOf('(');
    if (parenIndex !== -1) {
        sectionNumber = sectionNumber.substring(0, parenIndex - 1).trim();
    }

    return sectionNumber;
}

/**
 * Checks if a section is special (GPS, Special Topics, etc.)
 */
function isSpecialSection(
    courseSectionFull: string,
    subjectAndNumber: string,
    config: ConverterConfig
): boolean {
    // Check if course is in special courses list
    if (config.specialCourses.some(sc => subjectAndNumber.includes(sc))) {
        return true;
    }

    // Check if section name contains special section substrings
    if (config.specialSections.some(ss => courseSectionFull.includes(ss))) {
        return true;
    }

    return false;
}

/**
 * Extracts academic term letter (A, B, C, D) from section number
 * Examples: "A01" → "A", "DL08/DD08/DX10" → "D"
 */
function extractTermLetter(sectionNumber: string): string {
    const match = sectionNumber.match(/^([ABCD])/i);
    return match ? match[1].toUpperCase() : 'A';
}

/**
 * Categorizes sections by type (Lecture, Discussion, Lab)
 */
export function categorizeSections(sections: PlannerSection[]): CategorizedSections {
    const categorized: CategorizedSections = {
        lectures: [],
        discussions: [],
        labs: [],
        other: []
    };

    for (const section of sections) {
        // Determine category based on period type
        const type = section.periods[0]?.type || 'Other';

        if (type === 'Lecture') {
            categorized.lectures.push(section);
        } else if (type === 'Discussion') {
            categorized.discussions.push(section);
        } else if (type === 'Lab') {
            categorized.labs.push(section);
        } else {
            categorized.other.push(section);
        }
    }

    return categorized;
}
