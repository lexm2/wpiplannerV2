/**
 * Transforms Workday section data into PlannerSection objects
 */

import { WorkdaySection } from '../types/workdayTypes.js';
import { PlannerSection, PlannerPeriod } from '../types/outputTypes.js';
import { parseSectionDetails } from '../utils/timeParser.js';
import { ConverterConfig } from '../ConverterConfig.js';

export interface CategorizedSections {
  lectures: PlannerSection[];
  discussions: PlannerSection[];
  labs: PlannerSection[];
  other: PlannerSection[];
}

/**
 * Transforms a Workday section into PlannerSection(s)
 * Returns array because graduate courses with F/S terms are duplicated for A+B or C+D
 */
export function transformSection(
  workdaySection: WorkdaySection,
  config: ConverterConfig,
): PlannerSection[] {
  // Extract basic section information
  const courseSectionFull = workdaySection.Course_Section;
  const instructionalFormat = workdaySection.Instructional_Format;

  // Skip cancelled sections (e.g. "X Cancel - 03/17/2026 - ...")
  if (/\bX\s+(Cancel|Cancelled)\b/i.test(courseSectionFull)) {
    return [];
  }

  // Extract department and course number
  const dashIndex = courseSectionFull.indexOf('-');
  const subjectAndNumber = courseSectionFull.substring(0, dashIndex);

  // Extract section number
  const sectionNumber = extractSectionNumber(
    courseSectionFull,
    subjectAndNumber,
    config,
  );

  // Check if this is a special section (GPS, Interest List, etc.)
  const isGPS = isSpecialSection(courseSectionFull, subjectAndNumber, config);
  const isInterestList = courseSectionFull.includes('Interest List');

  // Extract CRN from reference ID
  const referenceID = workdaySection.cour_sec_def_referenceID;
  const crn = parseInt(referenceID.substring(28, 34));

  // Parse enrollment data
  const enrolledCapacity = workdaySection.Enrolled_Capacity;
  const [enrolled, capacity] = enrolledCapacity
    .split('/')
    .map(s => parseInt(s.trim()));
  const seatsAvailable = capacity - enrolled;

  const waitlistCapacity = workdaySection.Waitlist_Waitlist_Capacity;
  const [waitlistActual, waitlistMax] = waitlistCapacity
    .split('/')
    .map(s => parseInt(s.trim()));

  // Get cluster ID (if any)
  const clusterId = workdaySection.CF_LRV_Cluster_Ref_ID || null;
  const note = isInterestList ? 'IntList' : clusterId || null;

  // Determine if graduate course
  const isGraduate = workdaySection.Academic_Level === 'Graduate';

  // Compute term from section number
  // Graduate courses keep F/S, undergraduate use A/B/C/D
  const computedTerm = extractTermLetter(sectionNumber, isGraduate);

  // Parse meeting patterns
  const sectionDetails = workdaySection.Section_Details || '';
  const meetingPatterns = parseSectionDetails(sectionDetails);

  // Get professor info
  let professor = workdaySection.Instructors || 'Not Assigned';
  if (!professor || professor.trim() === '') {
    professor = isInterestList ? 'N/A' : 'Not Assigned';
  }

  // Normalize type (Laboratory -> Lab)
  const type =
    instructionalFormat === 'Laboratory' ? 'Lab' : instructionalFormat;

  // Create periods from meeting patterns
  const periods: PlannerPeriod[] = meetingPatterns.map(pattern => {
    const isAsync =
      pattern.startTime === '12:00' && pattern.endTime === '12:00';
    return {
      type: type,
      professor: professor,
      startTime: pattern.startTime,
      endTime: pattern.endTime,
      location: pattern.location,
      building: '', // Workday doesn't separate building
      room: pattern.location,
      seats: capacity,
      seatsAvailable: seatsAvailable,
      actualWaitlist: waitlistActual,
      maxWaitlist: waitlistMax,
      specificSection: sectionNumber,
      days: pattern.days,
      isAsync,
    };
  });

  return [
    {
      crn,
      number: sectionNumber,
      seats: capacity,
      seatsAvailable: seatsAvailable,
      actualWaitlist: waitlistActual,
      maxWaitlist: waitlistMax,
      note,
      computedTerm,
      isGps: isGPS,
      isInterestList: isInterestList,
      periods,
    },
  ];
}

/**
 * Extracts section number from full course section string
 * Handles various formats: standard, GPS, Interest List, appendices
 */
function extractSectionNumber(
  courseSectionFull: string,
  subjectAndNumber: string,
  config: ConverterConfig,
): string {
  // Check for appendices (e.g., "A01-Quiz")
  const hasAppendix = config.sectionNumberAppendices.some(appendix =>
    courseSectionFull.includes(appendix),
  );

  if (hasAppendix) {
    // Extract: "CS 1101-A01-Quiz" -> "A01"
    const dashIndex = courseSectionFull.indexOf('-');
    const secondDashIndex = courseSectionFull.indexOf('-', dashIndex + 6);
    return courseSectionFull.substring(dashIndex + 1, secondDashIndex - 1);
  }

  // Check for Interest List
  if (courseSectionFull.includes('Interest List')) {
    const term = courseSectionFull.includes('Fall')
      ? 'Fall'
      : courseSectionFull.includes('Spring')
        ? 'Spring'
        : 'A Term';
    return `Interest List-${term}`;
  }

  // Check for special sections (GPS, Special Topics)
  if (isSpecialSection(courseSectionFull, subjectAndNumber, config)) {
    // Keep full section name: "GPS: Machine Learning"
    const dashIndex = courseSectionFull.indexOf('-');
    return courseSectionFull.substring(dashIndex + 1).trim();
  }

  // Standard section: "CS 1101-A01 - Intro" -> "A01"
  const dashIndex = courseSectionFull.indexOf('-');
  const secondDashIndex = courseSectionFull.indexOf('-', dashIndex + 1);

  if (secondDashIndex === -1) {
    // No second dash, take everything after first dash
    return courseSectionFull.substring(dashIndex + 1).trim();
  }

  let sectionNumber = courseSectionFull
    .substring(dashIndex + 1, secondDashIndex - 1)
    .trim();

  // Remove parenthetical suffixes: "A01 (Honors)" -> "A01"
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
  config: ConverterConfig,
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
 * Extracts academic term letter from section number
 * For undergraduate: "A01" -> "A", "DL08" -> "D"
 * For graduate: "F01" -> "F" (Fall), "S01" -> "S" (Spring)
 */
function extractTermLetter(sectionNumber: string, isGraduate: boolean): string {
  const match = sectionNumber.match(/^([ABCDFS])/i);
  const termLetter = match ? match[1].toUpperCase() : 'A';

  // Graduate courses keep F/S terms, UI handles display as A+B or C+D
  if (isGraduate && (termLetter === 'F' || termLetter === 'S')) {
    return termLetter;
  }

  // Standard undergraduate terms (A/B/C/D)
  return termLetter;
}

/**
 * Categorizes sections by type (Lecture, Discussion, Lab)
 */
export function categorizeSections(
  sections: PlannerSection[],
): CategorizedSections {
  const categorized: CategorizedSections = {
    lectures: [],
    discussions: [],
    labs: [],
    other: [],
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
