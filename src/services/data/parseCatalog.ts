/**
 * Turns course-data-constructed.json into a ScheduleDB. Pure, with no browser
 * or rune dependencies, so the web app (CourseDataService) and the course API
 * server parse the catalog through the same code.
 */
import type {
  ScheduleDB,
  Department,
  Course,
  Section,
  Period,
  Time,
  LectureGroup,
} from '../../types/types';
import { DayOfWeek, PeriodType } from '../../types/types';
import { AcademicTerm } from '../../types/schedule';
import type {
  RawDepartment,
  RawCourse,
  RawSection,
  RawLectureGroup,
  RawPeriod,
} from '../../types/rawData';
import { logger } from '../../utils/logger';
import * as z from 'zod';

// Envelope only: the payload is ~1275 departments of nested records, and
// parseDepartments below already parses each one defensively.
const CourseDataEnvelopeSchema = z.object({
  departments: z.array(z.custom<RawDepartment>()).optional(),
  generated: z.string().optional(),
});

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  nbsp: ' ',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
};

/** Decodes one HTML entity; unknown named ones become a space. */
function decodeEntity(body: string): string {
  if (body.startsWith('#')) {
    const hex = body[1] === 'x' || body[1] === 'X';
    const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? ' ';
}

/** Parses the catalog JSON, as fetched or read from disk, into a ScheduleDB. */
export function parseCatalog(raw: unknown): ScheduleDB {
  const jsonData = CourseDataEnvelopeSchema.parse(raw);

  if (!jsonData.departments || !Array.isArray(jsonData.departments)) {
    logger.error('Invalid JSON data structure:', jsonData);
    throw new Error('Invalid JSON data structure - missing departments array');
  }

  return {
    departments: parseDepartments(jsonData.departments),
    generated: jsonData.generated || new Date().toISOString(),
  };
}

function parseDepartments(departments: RawDepartment[]): Department[] {
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  let totalCoursesProcessed = 0;
  let duplicatesFixed = 0;

  const result = departments.map(deptData => {
    const department: Department = {
      abbreviation: deptData.abbreviation,
      name: deptData.name,
      courses: [],
    };

    department.courses = deptData.courses.map((courseData: RawCourse) => {
      totalCoursesProcessed++;
      let courseId = courseData.id;

      if (seenIds.has(courseId)) {
        duplicateIds.add(courseId);

        const STRICT_VALIDATION =
          import.meta.env.DEV || import.meta.env.MODE === 'development';

        if (STRICT_VALIDATION) {
          // Fail hard in dev to force fixing bad data at the source
          throw new Error(
            `CRITICAL DATA ERROR: Duplicate course ID "${courseId}" detected.\n` +
              `This indicates a data quality issue in course-data-constructed.json.\n` +
              `Please fix the backend data generation process.\n` +
              `Duplicate IDs found so far: ${Array.from(duplicateIds).join(', ')}`,
          );
        } else {
          // Production fallback: derive a synthetic unique ID
          const originalId = courseId;
          const fallbackId = `${department.abbreviation}-${courseData.number}`;
          logger.error(
            `DUPLICATE ID: "${courseId}" for ${department.abbreviation}${courseData.number}`,
          );
          logger.error(`   Using fallback ID: "${fallbackId}"`);
          courseId = fallbackId;
          duplicatesFixed++;

          // If fallback is also a duplicate, append a counter
          let counter = 2;
          while (seenIds.has(courseId)) {
            courseId = `${fallbackId}-${counter}`;
            counter++;
          }

          logger.error('[Data Quality Issue]', {
            type: 'duplicate_course_id',
            originalId,
            fallbackId: courseId,
            timestamp: Date.now(),
          });
        }
      }

      seenIds.add(courseId);

      return parseCourse(courseData, department, courseId);
    });

    return department;
  });

  if (duplicatesFixed > 0) {
    logger.warn(
      `Course ID deduplication: fixed ${duplicatesFixed} of ${totalCoursesProcessed} courses; affected IDs: [${Array.from(duplicateIds).join(', ')}]`,
    );
  }

  return result;
}

/**
 * One catalog course. The tutorial's hand-made courses come through here too,
 * so a field the catalog carries cannot be dropped on one path only.
 */
export function parseCourse(
  courseData: RawCourse,
  department: Pick<Department, 'abbreviation' | 'name'>,
  courseId = courseData.id,
): Course {
  const lectures = parseLectureGroups(courseData.lectures || []);
  const standaloneLabs = courseData.standaloneLabs
    ? parseSections(courseData.standaloneLabs)
    : undefined;

  return {
    id: courseId,
    number: courseData.number,
    name: courseData.name,
    description: stripHtml(courseData.description || ''),
    category: courseData.category ?? null,
    departmentAbbr: department.abbreviation,
    departmentName: department.name,
    lectures: lectures.length > 0 ? lectures : undefined,
    standaloneLabs: standaloneLabs,
    minCredits: courseData.minCredits || 0,
    maxCredits: courseData.maxCredits || 0,
    isGraduate: courseData.isGraduate || false,
    academicYear: courseData.academicYear,
  };
}

function parseSections(sections: RawSection[]): Section[] {
  return sections.map(sectionData => {
    const section: Section = {
      crn: sectionData.crn || 0,
      number: sectionData.number || '',
      seats: sectionData.seats || 0,
      seatsAvailable: sectionData.seatsAvailable || 0,
      actualWaitlist: sectionData.actualWaitlist || 0,
      maxWaitlist: sectionData.maxWaitlist || 0,
      note: sectionData.note,
      computedTerm: sectionData.computedTerm as AcademicTerm,
      isInterestList: sectionData.isInterestList,
      deliveryMode: sectionData.deliveryMode ?? '',
      status: sectionData.status ?? '',
      startDate: sectionData.startDate ?? '',
      endDate: sectionData.endDate ?? '',
      periods: parsePeriods(sectionData.periods || []),
    };

    return section;
  });
}

function parseLectureGroups(lectureGroups: RawLectureGroup[]): LectureGroup[] {
  return lectureGroups.map(groupData => {
    const lectureSection = parseSections([groupData.section])[0];
    const compatibleDiscussions = parseSections(
      groupData.compatibleDiscussions || [],
    );
    const compatibleLabs = parseSections(groupData.compatibleLabs || []);

    return {
      section: lectureSection,
      compatibleDiscussions: compatibleDiscussions,
      compatibleLabs: compatibleLabs,
    };
  });
}

function parsePeriods(periods: RawPeriod[]): Period[] {
  return periods.map(periodData => {
    const period: Period = {
      type: parsePeriodType(periodData.type || 'Lecture'),
      professor: periodData.professor || '',
      professorEmail: undefined,
      startTime: parseTime(periodData.startTime),
      endTime: parseTime(periodData.endTime),
      location: periodData.location || '',
      building: periodData.building || '',
      room: periodData.room || '',
      seats: periodData.seats || 0,
      seatsAvailable: periodData.seatsAvailable || 0,
      actualWaitlist: periodData.actualWaitlist || 0,
      maxWaitlist: periodData.maxWaitlist || 0,
      days: parseDays(periodData.days || []),
      specificSection: periodData.specificSection,
      isAsync: periodData.isAsync || false,
    };
    return period;
  });
}

function parsePeriodType(typeString: string): PeriodType {
  const normalizedType = typeString.trim();

  switch (normalizedType) {
    case 'Lecture':
      return PeriodType.LECTURE;
    case 'Lab':
      return PeriodType.LAB;
    case 'Discussion':
      return PeriodType.DISCUSSION;
    case 'Seminar':
      return PeriodType.SEMINAR;
    case 'Workshop':
      return PeriodType.WORKSHOP;
    case 'Experiential':
      return PeriodType.EXPERIENTIAL;
    case 'Independent Study':
      return PeriodType.INDEPENDENT_STUDY;
    case 'Internship':
      return PeriodType.INTERNSHIP;
    case 'Research':
      return PeriodType.RESEARCH;
    case 'Thesis':
      return PeriodType.THESIS;
    default:
      logger.warn(
        `Unknown period type: "${typeString}", defaulting to Lecture`,
      );
      return PeriodType.LECTURE;
  }
}

function parseTime(timeStr: string): Time {
  if (!timeStr || timeStr === 'TBA') {
    return { hours: 0, minutes: 0, displayTime: 'TBD' };
  }

  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    return { hours: 0, minutes: 0, displayTime: timeStr };
  }

  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);

  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayTime = `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;

  return { hours, minutes, displayTime };
}

function parseDays(days: string[]): Set<DayOfWeek> {
  const daySet = new Set<DayOfWeek>();

  for (const day of days) {
    switch (day.toUpperCase()) {
      case 'M':
        daySet.add(DayOfWeek.MONDAY);
        break;
      case 'T':
        daySet.add(DayOfWeek.TUESDAY);
        break;
      case 'W':
        daySet.add(DayOfWeek.WEDNESDAY);
        break;
      case 'R':
        daySet.add(DayOfWeek.THURSDAY);
        break;
      case 'F':
        daySet.add(DayOfWeek.FRIDAY);
        break;
      case 'S':
        daySet.add(DayOfWeek.SATURDAY);
        break;
      case 'U':
        daySet.add(DayOfWeek.SUNDAY);
        break;
    }
  }

  return daySet;
}

function stripHtml(html: string): string {
  // Only real entities: a bare "&" in prose ("reading & listening") must
  // not swallow the text up to the next semicolon.
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (_entity, body: string) =>
      decodeEntity(body),
    )
    .trim();
}
