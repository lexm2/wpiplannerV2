/**
 * Transforms Workday course data into PlannerCourse objects
 */

import { WorkdaySection } from '../types/workdayTypes.js';
import { PlannerCourse } from '../types/outputTypes.js';
import {
  transformSection,
  categorizeSections,
  isSpecialSection,
} from './sectionTransformer.js';
import { buildLectureGroups } from './lectureGroupBuilder.js';
import { sanitizeHTML, extractCategory } from '../utils/htmlSanitizer.js';
import { ConverterConfig } from '../ConverterConfig.js';

const COMPANION_FORMATS = new Set(['Laboratory', 'Discussion']);

/**
 * Transforms a group of Workday sections (same course) into a PlannerCourse
 */
export function transformCourse(
  workdaySections: WorkdaySection[],
  departmentAbbrev: string,
  config: ConverterConfig,
): PlannerCourse {
  if (workdaySections.length === 0) {
    throw new Error('Cannot transform course with no sections');
  }

  const firstSection = workdaySections[0];

  const courseSection = firstSection.Course_Section;
  const dashIndex = courseSection.indexOf('-');
  const subjectAndNumber = courseSection.substring(0, dashIndex);
  const courseNumber = subjectAndNumber.substring(
    subjectAndNumber.indexOf(' ') + 1,
  );

  const courseTitle = firstSection.Course_Title;
  const titleDashIndex = courseTitle.indexOf('-');
  const courseName =
    titleDashIndex !== -1
      ? courseTitle.substring(titleDashIndex + 2).trim()
      : courseSection.substring(courseSection.lastIndexOf('-') + 1).trim();

  const isSpecialCourse = isSpecialSection(
    courseSection,
    subjectAndNumber,
    config,
  );

  const descriptionRaw = isSpecialCourse
    ? firstSection.Course_Description
    : firstSection.Course_Section_Description;

  const { category, cleanedHtml } = extractCategory(descriptionRaw);
  const description = sanitizeHTML(cleanedHtml);

  const isGraduate = firstSection.Academic_Level === 'Graduate';

  // Parse fall year from "2025 - 2026 Academic Year"
  const academicYear = parseInt(firstSection.Academic_Year);

  const converted = workdaySections.map(ws => ({
    ws,
    sections: transformSection(ws, config),
  }));
  const plannerSections = converted.flatMap(c => c.sections);

  // Interest lists are waitlist placeholders, mostly listed at 0 credits, so
  // only sections a student can enroll in set the range, and of those the
  // ones that head a lecture group: every section repeats the course's
  // credits, and the odd companion is mislabeled (PH 1110's AD08 says 0).
  // Lab-only courses use their labs, and a course with nothing but
  // placeholders falls back to them.
  const enrollable = converted
    .filter(c => c.sections.some(s => !s.isInterestList))
    .map(c => c.ws);
  const heads = enrollable.filter(
    ws => !COMPANION_FORMATS.has(ws.Instructional_Format),
  );
  const credited = [heads, enrollable, workdaySections].find(
    rows => rows.length > 0,
  )!;
  const credits = credited.map(ws => parseFloat(ws.Credits) || 0);

  const categorized = categorizeSections(plannerSections);

  const lectures = buildLectureGroups(categorized);

  lectures.push(
    ...categorized.other.map(section => ({
      section,
      compatibleDiscussions: [],
      compatibleLabs: [],
    })),
  );

  const standaloneLabs =
    lectures.length === 0 && categorized.labs.length > 0
      ? categorized.labs
      : undefined;

  return {
    id: `${departmentAbbrev}-${courseNumber}-${academicYear}`,
    number: courseNumber,
    name: courseName,
    description,
    category,
    minCredits: Math.min(...credits),
    maxCredits: Math.max(...credits),
    isGraduate,
    academicYear,
    lectures,
    standaloneLabs,
  };
}
