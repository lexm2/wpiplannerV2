import type { ValidatedSyncData, ValidatedScheduleData, ValidatedSelectedCourseData } from './schemas';
import type { Course, Department, Section } from '../../types/types';
import type { SelectedCourse, Schedule } from '../../types/schedule';
import { getAllSections } from '../../utils/courseUtils';

/**
 * Conversion Error
 *
 * Thrown when conversion from cloud data to application data fails.
 * Common causes:
 * - Course ID not found in catalog
 * - Section CRN not found for course
 * - Catalog out of sync with cloud data
 */
export class ConversionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConversionError';
    }
}

/**
 * Importable Data Format
 *
 * This is the format expected by ProfileStateManager.importData()
 * It has full SelectedCourse objects (not just IDs)
 */
export interface ImportableData {
    version: string;
    timestamp: number;
    checksum: string;
    activeScheduleId: string | null;
    schedules: Schedule[];
    preferences?: unknown;
}

/**
 * Sync Data Converter
 *
 * Converts cloud sync data (IDs only) to application data (full objects).
 *
 * The cloud stores minimal data (SelectedCourseData with IDs/CRNs only)
 * The app uses full objects (SelectedCourse with Course and Section references)
 *
 * This converter bridges the gap by:
 * 1. Looking up course IDs in the local catalog
 * 2. Resolving section CRNs to full Section objects
 * 3. Constructing complete SelectedCourse objects
 * 4. Validating all references exist
 */
export class SyncDataConverter {
    private courseIndex: Map<string, Course>;

    constructor(private allDepartments: Department[]) {
        // Build course index for O(1) lookups
        this.courseIndex = new Map();
        for (const dept of allDepartments) {
            for (const course of dept.courses) {
                this.courseIndex.set(course.id, course);
            }
        }

        console.log(`[Converter] Initialized with ${this.courseIndex.size} courses from ${allDepartments.length} departments`);
    }

    /**
     * Convert SelectedCourseData (IDs only) to SelectedCourse (full objects)
     *
     * @param data - Validated cloud course data
     * @returns Full SelectedCourse with all references resolved
     * @throws ConversionError if course or section not found
     */
    convertSelectedCourseData(data: ValidatedSelectedCourseData): SelectedCourse {
        // Find course in catalog
        const course = this.findCourseById(data.courseId);
        if (!course) {
            throw new ConversionError(
                `Course ${data.courseId} not found in catalog. ` +
                `The course may have been removed or the catalog needs to be updated.`
            );
        }

        // Resolve section if CRN provided
        let section: Section | null = null;
        if (data.selectedSectionCrn) {
            section = this.findSectionByCRN(course, data.selectedSectionCrn);
            if (!section) {
                throw new ConversionError(
                    `Section CRN ${data.selectedSectionCrn} not found for course ${data.courseId}. ` +
                    `The section may no longer be offered.`
                );
            }
        }

        // Handle locked section
        const lockedSections = data.lockedSectionCrn
            ? new Set([data.lockedSectionCrn])
            : new Set<string>();

        // Construct full SelectedCourse object
        return {
            course,
            selectedLecture: null,
            selectedDiscussion: null,
            selectedLab: null,
            selectedSection: section,
            selectedSectionNumber: section?.number || null,
            isRequired: data.isRequired,
            lockedSections
        };
    }

    /**
     * Convert ScheduleData to Schedule with full course objects
     *
     * @param data - Validated cloud schedule data
     * @returns Full Schedule with converted courses
     * @throws ConversionError if any course conversion fails
     */
    convertScheduleData(data: ValidatedScheduleData): Schedule {
        console.log(`[Converter] Converting schedule "${data.name}" with ${data.selectedCourses.length} courses`);

        const convertedCourses: SelectedCourse[] = [];
        const errors: string[] = [];

        for (const courseData of data.selectedCourses) {
            try {
                const convertedCourse = this.convertSelectedCourseData(courseData);
                convertedCourses.push(convertedCourse);
            } catch (error) {
                if (error instanceof ConversionError) {
                    errors.push(error.message);
                } else {
                    throw error;
                }
            }
        }

        if (errors.length > 0) {
            throw new ConversionError(
                `Failed to convert ${errors.length} course(s) in schedule "${data.name}":\n` +
                errors.map(e => `  - ${e}`).join('\n')
            );
        }

        return {
            id: data.id,
            name: data.name,
            selectedCourses: convertedCourses,
            generatedSchedules: [],
            timestamp: data.timestamp || Date.now()
        };
    }

    /**
     * Convert complete SyncData to importable format
     *
     * @param syncData - Validated cloud sync data
     * @returns Importable data ready for ProfileStateManager
     * @throws ConversionError if any schedule conversion fails
     */
    convertSyncData(syncData: ValidatedSyncData): ImportableData {
        console.log(`[Converter] Converting ${syncData.schedules.length} schedules from cloud format`);

        const convertedSchedules = syncData.schedules.map(schedule =>
            this.convertScheduleData(schedule)
        );

        const totalCourses = convertedSchedules.reduce(
            (sum, schedule) => sum + schedule.selectedCourses.length,
            0
        );

        console.log(`[Converter] ✓ Converted ${convertedSchedules.length} schedules with ${totalCourses} total courses`);

        return {
            version: syncData.version,
            timestamp: syncData.timestamp,
            checksum: syncData.checksum,
            activeScheduleId: syncData.activeScheduleId,
            schedules: convertedSchedules,
            preferences: syncData.preferences
        };
    }

    /**
     * Find course by ID in catalog
     *
     * @param courseId - Course ID to find
     * @returns Course object or null if not found
     */
    private findCourseById(courseId: string): Course | null {
        return this.courseIndex.get(courseId) || null;
    }

    /**
     * Find section by CRN in course
     *
     * @param course - Course to search
     * @param crn - Section CRN to find
     * @returns Section object or null if not found
     */
    private findSectionByCRN(course: Course, crn: string): Section | null {
        const allSections = getAllSections(course);
        return allSections.find(s => s.crn.toString() === crn) || null;
    }
}
