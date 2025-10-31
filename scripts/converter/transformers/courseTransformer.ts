/**
 * Transforms Workday course data into PlannerCourse objects
 */

import { WorkdaySection } from '../types/workdayTypes.js';
import { PlannerCourse } from '../types/outputTypes.js';
import { transformSection, categorizeSections } from './sectionTransformer.js';
import { buildLectureGroups, buildOtherLectureGroups } from './lectureGroupBuilder.js';
import { sanitizeHTML } from '../utils/htmlSanitizer.js';
import { ConverterConfig } from '../ConverterConfig.js';

/**
 * Transforms a group of Workday sections (same course) into a PlannerCourse
 */
export function transformCourse(
    workdaySections: WorkdaySection[],
    departmentAbbrev: string,
    config: ConverterConfig
): PlannerCourse {
    if (workdaySections.length === 0) {
        throw new Error('Cannot transform course with no sections');
    }

    const firstSection = workdaySections[0];

    // Extract course information from first section
    const courseSection = firstSection.Course_Section;
    const dashIndex = courseSection.indexOf('-');
    const subjectAndNumber = courseSection.substring(0, dashIndex);
    const courseNumber = subjectAndNumber.substring(subjectAndNumber.indexOf(' ') + 1);

    // Extract course name
    const courseTitle = firstSection.Course_Title;
    const titleDashIndex = courseTitle.indexOf('-');
    const courseName = titleDashIndex !== -1
        ? courseTitle.substring(titleDashIndex + 2).trim()
        : courseSection.substring(courseSection.lastIndexOf('-') + 1).trim();

    // Get description (use Course_Description for special courses)
    const isSpecialCourse = config.specialCourses.some(
        sc => subjectAndNumber.includes(sc)
    ) || config.specialSections.some(
        ss => courseSection.includes(ss)
    );

    const descriptionRaw = isSpecialCourse
        ? firstSection.Course_Description
        : firstSection.Course_Section_Description;

    const description = sanitizeHTML(descriptionRaw);

    // Parse credits
    const credits = parseFloat(firstSection.Credits);

    // Transform all sections
    const plannerSections = workdaySections
        .map(ws => transformSection(ws, config))
        .filter((s): s is NonNullable<typeof s> => s !== null);

    // Categorize sections by type
    const categorized = categorizeSections(plannerSections);

    // Build lecture groups (NEW HIERARCHICAL STRUCTURE)
    const lectures = buildLectureGroups(categorized);

    // Add "other" sections (seminars, etc.) as lecture groups
    const otherLectures = buildOtherLectureGroups(categorized.other);
    lectures.push(...otherLectures);

    // Handle lab-only courses
    const standaloneLabs = lectures.length === 0 && categorized.labs.length > 0
        ? categorized.labs
        : undefined;

    return {
        id: `${departmentAbbrev}-${courseNumber}`,
        number: courseNumber,
        name: courseName,
        description,
        min_credits: credits,
        max_credits: credits,
        lectures,
        standaloneLabs
    };
}
