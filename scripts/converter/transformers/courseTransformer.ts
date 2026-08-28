/**
 * Transforms Workday course data into PlannerCourse objects
 */

import { WorkdaySection } from '../types/workdayTypes.js';
import { PlannerCourse } from '../types/outputTypes.js';
import { transformSection, categorizeSections } from './sectionTransformer.js';
import { buildLectureGroups } from './lectureGroupBuilder.js';
import { sanitizeHTML, extractCategory } from '../utils/htmlSanitizer.js';
import { ConverterConfig } from '../ConverterConfig.js';

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

  const isSpecialCourse =
    config.specialCourses.some(sc => subjectAndNumber.includes(sc)) ||
    config.specialSections.some(ss => courseSection.includes(ss));

  const descriptionRaw = isSpecialCourse
    ? firstSection.Course_Description
    : firstSection.Course_Section_Description;

  const { category, cleanedHtml } = extractCategory(descriptionRaw);
  const description = sanitizeHTML(cleanedHtml);

  const credits = parseFloat(firstSection.Credits);

  const isGraduate = firstSection.Academic_Level === 'Graduate';

  // Parse fall year from "2025 - 2026 Academic Year"
  const academicYear = parseInt(firstSection.Academic_Year);

  // Transform all sections (flatMap because graduate F/S terms expand to multiple sections)
  const plannerSections = workdaySections.flatMap(ws =>
    transformSection(ws, config),
  );

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
    minCredits: credits,
    maxCredits: credits,
    isGraduate,
    academicYear,
    lectures,
    standaloneLabs,
  };
}
