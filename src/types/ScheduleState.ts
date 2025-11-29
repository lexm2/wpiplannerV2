import type { Course, Section, Department } from './types';
import type { SelectedCourse, ScheduleCombination, Schedule } from './schedule';
import type { ScheduleData, SelectedCourseData } from '../services/sync/types';
import { checksumCalculator } from '../services/sync/checksum';
import { getAllSections } from '../utils/courseUtils';

/**
 * Universal schedule data class used throughout the application.
 *
 * This class provides:
 * - Storage of full objects (Course, Section) for app use
 * - Built-in checksum calculation methods (object-oriented)
 * - Cloud serialization (IDs only) for efficient sync
 * - Single source of truth for schedule data
 *
 * Data Flow:
 * - Cloud stores IDs only (ScheduleData)
 * - App uses full objects (ScheduleState)
 * - Conversion happens at cloud boundary via toCloudFormat/fromCloudFormat
 */
export class ScheduleState {
    readonly id: string;
    readonly name: string;
    readonly selectedCourses: SelectedCourse[];
    readonly generatedSchedules: ScheduleCombination[];
    readonly timestamp: number;

    constructor(
        id: string,
        name: string,
        selectedCourses: SelectedCourse[] = [],
        generatedSchedules: ScheduleCombination[] = [],
        timestamp: number = Date.now()
    ) {
        this.id = id;
        this.name = name;
        this.selectedCourses = selectedCourses;
        this.generatedSchedules = generatedSchedules;
        this.timestamp = timestamp;
    }

    /**
     * Calculate checksum for this schedule's data
     *
     * Uses cloud format (IDs only) for consistent checksums across devices.
     *
     * @returns 64-character SHA-256 hash
     */
    async calculateChecksum(): Promise<string> {
        const cloudData = this.toCloudFormat();
        return checksumCalculator.calculateChecksum({
            version: '3.0',
            activeScheduleId: null, // Not included in schedule-level checksum
            schedules: [cloudData],
            preferences: undefined
        });
    }

    /**
     * Verify checksum matches expected value
     *
     * @param expectedChecksum - Expected checksum to compare against
     * @returns True if checksum matches
     */
    async verifyChecksum(expectedChecksum: string): Promise<boolean> {
        const calculated = await this.calculateChecksum();
        return calculated === expectedChecksum;
    }

    /**
     * Convert to cloud format (IDs only) for efficient storage
     *
     * This is the boundary where full objects → IDs conversion happens.
     *
     * @returns ScheduleData with IDs only
     */
    toCloudFormat(): ScheduleData {
        return {
            id: this.id,
            name: this.name,
            timestamp: this.timestamp,
            selectedCourses: this.selectedCourses.map(sc => {
                const courseData: SelectedCourseData = {
                    courseId: sc.course.id,
                    selectedSectionCrn: sc.selectedSection?.crn.toString(),
                    lockedSectionCrn: sc.lockedSections.size > 0
                        ? Array.from(sc.lockedSections)[0]
                        : undefined,
                    isRequired: sc.isRequired,
                    timestamp: this.timestamp
                };
                return courseData;
            })
        };
    }

    /**
     * Create from cloud format (IDs) by hydrating with full objects
     *
     * This is the boundary where IDs → full objects conversion happens.
     *
     * @param cloudData - Cloud format with IDs only
     * @param courseCatalog - Department catalog to resolve course references
     * @returns ScheduleState with full objects
     * @throws Error if course/section not found in catalog
     */
    static fromCloudFormat(
        cloudData: ScheduleData,
        courseCatalog: Department[]
    ): ScheduleState {
        const selectedCourses: SelectedCourse[] = [];

        for (const courseData of cloudData.selectedCourses) {
            const course = findCourseById(courseData.courseId, courseCatalog);
            if (!course) {
                throw new Error(
                    `Course ${courseData.courseId} not found in catalog. ` +
                    `The course may have been removed or catalog needs updating.`
                );
            }

            let section: Section | null = null;
            if (courseData.selectedSectionCrn) {
                section = findSectionByCRN(course, courseData.selectedSectionCrn);
                if (!section) {
                    throw new Error(
                        `Section CRN ${courseData.selectedSectionCrn} not found for ` +
                        `course ${courseData.courseId}. Section may no longer be offered.`
                    );
                }
            }

            const lockedSections = courseData.lockedSectionCrn
                ? new Set([courseData.lockedSectionCrn])
                : new Set<string>();

            selectedCourses.push({
                course,
                selectedLecture: null,
                selectedDiscussion: null,
                selectedLab: null,
                selectedSection: section,
                selectedSectionNumber: section?.number || null,
                isRequired: courseData.isRequired,
                lockedSections
            });
        }

        return new ScheduleState(
            cloudData.id,
            cloudData.name,
            selectedCourses,
            [], // generatedSchedules not synced to cloud
            cloudData.timestamp || Date.now()
        );
    }

    /**
     * Create a copy with updated fields (immutable update)
     *
     * @param updates - Partial updates to apply
     * @returns New ScheduleState instance with updates
     */
    with(updates: Partial<{
        name: string;
        selectedCourses: SelectedCourse[];
        generatedSchedules: ScheduleCombination[];
    }>): ScheduleState {
        return new ScheduleState(
            this.id,
            updates.name ?? this.name,
            updates.selectedCourses ?? this.selectedCourses,
            updates.generatedSchedules ?? this.generatedSchedules,
            Date.now() // Update timestamp on any change
        );
    }

    /**
     * Create from legacy Schedule interface (migration helper)
     *
     * @param schedule - Legacy Schedule object
     * @returns ScheduleState instance
     */
    static fromLegacySchedule(schedule: Schedule): ScheduleState {
        return new ScheduleState(
            schedule.id,
            schedule.name,
            schedule.selectedCourses,
            schedule.generatedSchedules,
            schedule.timestamp || Date.now()
        );
    }

    /**
     * Convert to legacy Schedule interface (migration helper)
     *
     * @returns Schedule in legacy format
     */
    toLegacySchedule(): Schedule {
        return {
            id: this.id,
            name: this.name,
            selectedCourses: this.selectedCourses,
            generatedSchedules: this.generatedSchedules,
            timestamp: this.timestamp
        };
    }
}

/**
 * Find course by ID in all departments
 *
 * @param courseId - Course ID to find
 * @param departments - Department catalog
 * @returns Course object or null
 */
function findCourseById(courseId: string, departments: Department[]): Course | null {
    for (const dept of departments) {
        const course = dept.courses.find(c => c.id === courseId);
        if (course) return course;
    }
    return null;
}

/**
 * Find section by CRN in course
 *
 * @param course - Course to search
 * @param crn - Section CRN
 * @returns Section object or null
 */
function findSectionByCRN(course: Course, crn: string): Section | null {
    const allSections = getAllSections(course);
    return allSections.find(s => s.crn.toString() === crn) || null;
}
