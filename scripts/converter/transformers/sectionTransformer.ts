/**
 * Transforms Workday section data into PlannerSection objects
 */

import { WorkdaySection } from '../types/workdayTypes.js';
import { PlannerSection, PlannerPeriod } from '../types/outputTypes.js';
import { parseSectionDetails } from '../utils/timeParser.js';
import { ConverterConfig } from '../ConverterConfig.js';
import { tagValues } from '../utils/courseTags.js';

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
  const courseSectionFull = workdaySection.Course_Section;
  const instructionalFormat = workdaySection.Instructional_Format;

  if (isCanceledSection(courseSectionFull)) {
    return [];
  }

  const dashIndex = courseSectionFull.indexOf('-');
  const subjectAndNumber = courseSectionFull.substring(0, dashIndex);

  const sectionNumber = extractSectionNumber(
    courseSectionFull,
    subjectAndNumber,
    config,
  );

  // Check if this is a special section (GPS, Interest List, etc.)
  const isGPS = isSpecialSection(courseSectionFull, subjectAndNumber, config);
  const isInterestList = courseSectionFull.includes('Interest List');

  const crn = crnOf(workdaySection);

  const enrolledCapacity = workdaySection.Enrolled_Capacity;
  const [enrolled, capacity] = enrolledCapacity
    .split('/')
    .map(s => parseInt(s.trim()));
  const seatsAvailable = capacity - enrolled;

  const waitlistCapacity = workdaySection.Waitlist_Waitlist_Capacity;
  const [waitlistActual, waitlistMax] = waitlistCapacity
    .split('/')
    .map(s => parseInt(s.trim()));

  const clusterId = workdaySection.CF_LRV_Cluster_Ref_ID || null;
  const note = isInterestList ? 'IntList' : clusterId || null;

  // Graduate courses keep F/S, undergraduate use A/B/C/D
  const computedTerm = isInterestList
    ? interestListTerm(courseSectionFull)
    : extractTermLetter(sectionNumber);

  const sectionDetails = workdaySection.Section_Details || '';
  const meetingPatterns = parseSectionDetails(sectionDetails);

  let professor = workdaySection.Instructors || 'Not Assigned';
  if (!professor || professor.trim() === '') {
    professor = isInterestList ? 'N/A' : 'Not Assigned';
  }

  // Normalize type (Laboratory -> Lab)
  const type =
    instructionalFormat === 'Laboratory' ? 'Lab' : instructionalFormat;

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
      isOnlineGrad: tagValues(
        workdaySection.Course_Tags,
        'Graduate Studies Online',
      ).includes('Online Grad Course'),
      meetsWith: coLocatedSections(
        workdaySection['Co-Located_Course_Sections'],
      ),
      deliveryMode: workdaySection.Delivery_Mode,
      status: workdaySection.Section_Status,
      startDate: workdaySection.Course_Section_Start_Date,
      endDate: workdaySection.Course_Section_End_Date,
      periods,
    },
  ];
}

/**
 * Sections Workday has canceled by renaming them rather than by status:
 * "X Cancel - 03/17/2026 - ...", "X-Cancel-Draft ...", "X-Canceled-...".
 */
export function isCanceledSection(courseSectionFull: string): boolean {
  return /\bX[\s-]+Cancel(l?ed)?\b/i.test(courseSectionFull);
}

/** The CRN, from "COURSE_SECTION_DEFINITION-3-348909". */
export function crnOf(workdaySection: WorkdaySection): number {
  return parseInt(workdaySection.cour_sec_def_referenceID.substring(28, 34));
}

/**
 * The sections a section is co-located with, as "BB 550-C01". Each entry is
 * "CODE-SECTION - Title", and a cross-listed pair is written
 * "BB 4190-D01/ CH 4190-D01 - Title".
 */
function coLocatedSections(coLocated: string | undefined): string[] {
  if (!coLocated) return [];
  return coLocated
    .split(/\s*;\s*/)
    .flatMap(entry => entry.split(' - ')[0].split('/'))
    .map(code => code.trim())
    .filter(Boolean);
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
    // Keep just the code: "CS 1101-A01-Quiz" -> "A01",
    // "MA 1024-AD03-ACL (group 2)" -> "AD03", like a plain "(group N)" suffix.
    const code = courseSectionFull
      .slice(courseSectionFull.indexOf('-') + 1)
      .match(/^[A-Z0-9]+/);
    if (code) return code[0];
  }

  // Check for Interest List
  if (courseSectionFull.includes('Interest List')) {
    const term = interestListTerm(courseSectionFull);
    const label =
      term === 'F' ? 'Fall' : term === 'S' ? 'Spring' : `${term} Term`;
    return `Interest List-${label}`;
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
  let sectionNumber = courseSectionFull.substring(
    dashIndex + 1,
    secondDashIndex === -1 ? undefined : secondDashIndex,
  );

  // Remove parenthetical suffixes: "A01 (Honors)" -> "A01"
  const parenIndex = sectionNumber.indexOf('(');
  if (parenIndex !== -1) sectionNumber = sectionNumber.substring(0, parenIndex);

  sectionNumber = sectionNumber.trim();
  return sectionNumber;
}

/**
 * Checks if a section is special (GPS, Special Topics, etc.)
 */
export function isSpecialSection(
  courseSectionFull: string,
  subjectAndNumber: string,
  config: ConverterConfig,
): boolean {
  if (config.specialCourses.some(sc => subjectAndNumber.includes(sc))) {
    return true;
  }

  if (config.specialSections.some(ss => courseSectionFull.includes(ss))) {
    return true;
  }

  return false;
}

/**
 * An interest list's term is the first letter of its code: "CH 1020-DL-Interest
 * List" is D term, "MA 501-FD - Interest List" fall. Course_Section never
 * names the season, so the code is the only place it appears.
 */
function interestListTerm(courseSectionFull: string): string {
  const code = courseSectionFull.slice(courseSectionFull.indexOf('-') + 1);
  const match = code.match(/^\s*([ABCDFS])/i);
  return match ? match[1].toUpperCase() : 'A';
}

/**
 * Extracts academic term letter from section number
 * For undergraduate: "A01" -> "A", "DL08" -> "D"
 * For graduate: "F01" -> "F" (Fall), "S01" -> "S" (Spring)
 */
function extractTermLetter(sectionNumber: string): string {
  // Graduate F/S terms are kept; the UI displays them as A+B or C+D
  const match = sectionNumber.match(/^([ABCDFS])/i);
  return match ? match[1].toUpperCase() : 'A';
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
