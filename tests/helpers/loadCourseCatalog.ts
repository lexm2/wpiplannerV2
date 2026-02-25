import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Department, Course, Section, Period, LectureGroup } from '../../src/types/types';
import { DayOfWeek, PeriodType } from '../../src/types/types';

/**
 * Load the real course catalog from JSON file for testing.
 *
 * This parses the same course-data-constructed.json that the app uses,
 * providing accurate course data for tests.
 */

// Cache the loaded catalog
let cachedCatalog: Department[] | null = null;

/**
 * Load the course catalog from the JSON file.
 * Results are cached for performance.
 */
export async function loadCourseCatalog(): Promise<Department[]> {
    if (cachedCatalog) {
        return cachedCatalog;
    }

    const filePath = join(process.cwd(), 'public', 'course-data-constructed.json');
    const fileContent = await readFile(filePath, 'utf-8');
    const jsonData = JSON.parse(fileContent);

    cachedCatalog = parseConstructedDepartments(jsonData.departments);
    return cachedCatalog;
}

/**
 * Clear the cached catalog (useful for tests that need a fresh load)
 */
export function clearCatalogCache(): void {
    cachedCatalog = null;
}

// Parsing functions adapted from CourseDataService

function parseConstructedDepartments(departments: any[]): Department[] {
    const seenIds = new Set<string>();

    return departments.map(deptData => {
        const department: Department = {
            abbreviation: deptData.abbreviation,
            name: deptData.name,
            courses: []
        };

        department.courses = deptData.courses.map((courseData: any) => {
            let courseId = courseData.id;

            // Handle duplicate IDs (shouldn't happen with good data)
            if (seenIds.has(courseId)) {
                const fallbackId = `${department.abbreviation}-${courseData.number}`;
                courseId = fallbackId;
                let counter = 2;
                while (seenIds.has(courseId)) {
                    courseId = `${fallbackId}-${counter}`;
                    counter++;
                }
            }

            seenIds.add(courseId);

            const lectures = parseLectureGroups(courseData.lectures || []);
            const standaloneLabs = courseData.standaloneLabs
                ? parseConstructedSections(courseData.standaloneLabs)
                : undefined;

            const course: Course = {
                id: courseId,
                number: courseData.number,
                name: courseData.name,
                description: stripHtml(courseData.description || ''),
                departmentAbbr: department.abbreviation,
                departmentName: department.name,
                lectures: lectures.length > 0 ? lectures : undefined,
                standaloneLabs: standaloneLabs,
                minCredits: courseData.minCredits || 0,
                maxCredits: courseData.maxCredits || 0,
                isGraduate: courseData.isGraduate || false
            };
            return course;
        });

        return department;
    });
}

function parseConstructedSections(sections: any[]): Section[] {
    return sections.map(sectionData => {
        const section: Section = {
            crn: sectionData.crn || 0,
            number: sectionData.number || '',
            seats: sectionData.seats || 0,
            seatsAvailable: sectionData.seatsAvailable || 0,
            actualWaitlist: sectionData.actualWaitlist || 0,
            maxWaitlist: sectionData.maxWaitlist || 0,
            note: sectionData.note,
            description: stripHtml(sectionData.description || ''),
            term: sectionData.term || '',
            computedTerm: sectionData.computedTerm,
            isInterestList: sectionData.isInterestList,
            periods: parseConstructedPeriods(sectionData.periods || [])
        };

        return section;
    });
}

function parseLectureGroups(lectureGroups: any[]): LectureGroup[] {
    return lectureGroups.map(groupData => {
        const lectureSection = parseConstructedSections([groupData.section])[0];
        const compatibleDiscussions = parseConstructedSections(groupData.compatibleDiscussions || []);
        const compatibleLabs = parseConstructedSections(groupData.compatibleLabs || []);

        return {
            section: lectureSection,
            compatibleDiscussions: compatibleDiscussions,
            compatibleLabs: compatibleLabs
        };
    });
}

function parseConstructedPeriods(periods: any[]): Period[] {
    return periods.map(periodData => {
        const period: Period = {
            type: parsePeriodType(periodData.type || 'Lecture'),
            professor: periodData.professor || '',
            professorEmail: undefined,
            startTime: parseConstructedTime(periodData.startTime),
            endTime: parseConstructedTime(periodData.endTime),
            location: periodData.location || '',
            building: periodData.building || '',
            room: periodData.room || '',
            seats: periodData.seats || 0,
            seatsAvailable: periodData.seatsAvailable || 0,
            actualWaitlist: periodData.actualWaitlist || 0,
            maxWaitlist: periodData.maxWaitlist || 0,
            days: parseConstructedDays(periodData.days || []),
            specificSection: periodData.specificSection,
            isAsync: periodData.isAsync || false
        };
        return period;
    });
}

function parsePeriodType(typeString: string): PeriodType {
    switch (typeString.trim()) {
        case 'Lecture': return PeriodType.LECTURE;
        case 'Lab': return PeriodType.LAB;
        case 'Discussion': return PeriodType.DISCUSSION;
        case 'Seminar': return PeriodType.SEMINAR;
        case 'Workshop': return PeriodType.WORKSHOP;
        case 'Experiential': return PeriodType.EXPERIENTIAL;
        case 'Independent Study': return PeriodType.INDEPENDENT_STUDY;
        case 'Internship': return PeriodType.INTERNSHIP;
        case 'Research': return PeriodType.RESEARCH;
        case 'Thesis': return PeriodType.THESIS;
        default: return PeriodType.LECTURE;
    }
}

function parseConstructedTime(timeStr: string): { hours: number; minutes: number; displayTime: string } {
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

function parseConstructedDays(days: string[]): Set<DayOfWeek> {
    const daySet = new Set<DayOfWeek>();

    for (const day of days) {
        switch (day.toUpperCase()) {
            case 'M': daySet.add(DayOfWeek.MONDAY); break;
            case 'T': daySet.add(DayOfWeek.TUESDAY); break;
            case 'W': daySet.add(DayOfWeek.WEDNESDAY); break;
            case 'R': daySet.add(DayOfWeek.THURSDAY); break;
            case 'F': daySet.add(DayOfWeek.FRIDAY); break;
            case 'S': daySet.add(DayOfWeek.SATURDAY); break;
            case 'U': daySet.add(DayOfWeek.SUNDAY); break;
        }
    }

    return daySet;
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
}

/**
 * Get a list of valid course IDs from the catalog.
 * Useful for creating test data that uses real courses.
 */
export async function getValidCourseIds(limit: number = 10): Promise<string[]> {
    const catalog = await loadCourseCatalog();
    const ids: string[] = [];

    for (const dept of catalog) {
        for (const course of dept.courses) {
            ids.push(course.id);
            if (ids.length >= limit) return ids;
        }
    }

    return ids;
}

/**
 * Get a course by ID from the catalog
 */
export async function getCourseById(courseId: string): Promise<Course | undefined> {
    const catalog = await loadCourseCatalog();

    for (const dept of catalog) {
        const course = dept.courses.find(c => c.id === courseId);
        if (course) return course;
    }

    return undefined;
}

/**
 * Get the first section CRN for a course
 */
export async function getFirstSectionCrn(courseId: string): Promise<string | undefined> {
    const course = await getCourseById(courseId);
    if (!course) return undefined;

    // Check lectures first
    if (course.lectures && course.lectures.length > 0) {
        return course.lectures[0].section.crn.toString();
    }

    // Then standalone labs
    if (course.standaloneLabs && course.standaloneLabs.length > 0) {
        return course.standaloneLabs[0].crn.toString();
    }

    return undefined;
}
