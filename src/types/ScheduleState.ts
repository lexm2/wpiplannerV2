import type { Course, Section, Department } from './types';
import type { SelectedCourse, ScheduleCombination, Schedule, LocalCalendarEvent } from './schedule';
import type { ScheduleData, SelectedCourseData } from '../services/sync/types';
import type { ConnectedCalendar } from '../services/calendar/types';
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
    readonly connectedCalendar?: ConnectedCalendar;
    /** Locally-stored calendar events (not synced to cloud) */
    readonly localEvents: LocalCalendarEvent[];

    constructor(
        id: string,
        name: string,
        selectedCourses: SelectedCourse[] = [],
        generatedSchedules: ScheduleCombination[] = [],
        timestamp: number = Date.now(),
        connectedCalendar?: ConnectedCalendar,
        localEvents: LocalCalendarEvent[] = []
    ) {
        this.id = id;
        this.name = name;
        this.selectedCourses = selectedCourses;
        this.generatedSchedules = generatedSchedules;
        this.timestamp = timestamp;
        this.connectedCalendar = connectedCalendar;
        this.localEvents = localEvents;
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
     * NOTE: localEvents are intentionally excluded - they are stored locally only.
     *
     * @returns ScheduleData with IDs only
     */
    toCloudFormat(): ScheduleData {
        // NOTE: localEvents intentionally omitted - not synced to cloud
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
            }),
            connectedCalendar: this.connectedCalendar
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
            cloudData.timestamp || Date.now(),
            cloudData.connectedCalendar,
            [] // localEvents not synced to cloud - they stay local
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
        connectedCalendar: ConnectedCalendar;
        localEvents: LocalCalendarEvent[];
    }>): ScheduleState {
        return new ScheduleState(
            this.id,
            updates.name ?? this.name,
            updates.selectedCourses ?? this.selectedCourses,
            updates.generatedSchedules ?? this.generatedSchedules,
            Date.now(), // Update timestamp on any change
            updates.connectedCalendar ?? this.connectedCalendar,
            updates.localEvents ?? this.localEvents
        );
    }

    // =========================================================================
    // Course Query Methods
    // =========================================================================

    /**
     * Get the number of selected courses in this schedule
     *
     * @returns Course count
     */
    getCourseCount(): number {
        return this.selectedCourses.length;
    }

    /**
     * Check if schedule is empty (no courses selected)
     *
     * @returns True if no courses selected
     */
    isEmpty(): boolean {
        return this.selectedCourses.length === 0;
    }

    /**
     * Check if schedule contains a specific course
     *
     * @param courseId - Course ID to check
     * @returns True if course is in schedule
     */
    containsCourse(courseId: string): boolean {
        return this.selectedCourses.some(sc => sc.course.id === courseId);
    }

    /**
     * Get a specific selected course by ID
     *
     * @param courseId - Course ID to find
     * @returns Selected course or null if not found
     */
    getCourse(courseId: string): SelectedCourse | null {
        return this.selectedCourses.find(sc => sc.course.id === courseId) || null;
    }

    /**
     * Extract just the Course objects (not SelectedCourse wrappers)
     *
     * @returns Array of Course objects
     */
    getAllCourses(): Course[] {
        return this.selectedCourses.map(sc => sc.course);
    }

    // =========================================================================
    // Section Extraction Methods
    // =========================================================================

    /**
     * Get all sections from all courses (both available and selected)
     *
     * @returns Array of all sections across all courses
     */
    getAllSections(): Section[] {
        const sections: Section[] = [];
        for (const selectedCourse of this.selectedCourses) {
            sections.push(...getAllSections(selectedCourse.course));
        }
        return sections;
    }

    /**
     * Get only the currently selected sections
     *
     * @returns Array of selected sections (excludes unselected sections)
     */
    getSelectedSections(): Section[] {
        const sections: Section[] = [];
        for (const sc of this.selectedCourses) {
            if (sc.selectedLecture) sections.push(sc.selectedLecture);
            if (sc.selectedDiscussion) sections.push(sc.selectedDiscussion);
            if (sc.selectedLab) sections.push(sc.selectedLab);
            if (sc.selectedSection) sections.push(sc.selectedSection);
        }
        return sections;
    }

    /**
     * Get selected sections for a specific term
     *
     * @param term - Term code (A, B, C, D, or E)
     * @returns Sections for that term
     */
    getSectionsForTerm(term: string): Section[] {
        return this.getSelectedSections().filter(s => s.computedTerm === term);
    }

    // =========================================================================
    // Filtering Methods
    // =========================================================================

    /**
     * Get only required courses
     *
     * @returns Array of required selected courses
     */
    getRequiredCourses(): SelectedCourse[] {
        return this.selectedCourses.filter(sc => sc.isRequired);
    }

    /**
     * Get only elective courses
     *
     * @returns Array of elective selected courses
     */
    getElectiveCourses(): SelectedCourse[] {
        return this.selectedCourses.filter(sc => !sc.isRequired);
    }

    /**
     * Get courses that have locked sections
     *
     * @returns Array of selected courses with locked sections
     */
    getCoursesWithLockedSections(): SelectedCourse[] {
        return this.selectedCourses.filter(sc => sc.lockedSections.size > 0);
    }

    // =========================================================================
    // Statistics & Metadata
    // =========================================================================

    /**
     * Calculate total credit hours for the schedule
     *
     * @returns Object with min and max credit hours
     */
    getTotalCredits(): { min: number; max: number } {
        let min = 0;
        let max = 0;
        for (const sc of this.selectedCourses) {
            min += sc.course.minCredits || 0;
            max += sc.course.maxCredits || 0;
        }
        return { min, max };
    }

    /**
     * Group courses by term
     *
     * @returns Map of term code to selected courses
     */
    getCoursesByTerm(): Map<string, SelectedCourse[]> {
        const byTerm = new Map<string, SelectedCourse[]>();

        for (const sc of this.selectedCourses) {
            const sections = this.getSelectedSections();
            const courseSections = sections.filter(s =>
                getAllSections(sc.course).some(cs => cs.crn === s.crn)
            );

            for (const section of courseSections) {
                const term = section.computedTerm || 'Unknown';
                if (!byTerm.has(term)) {
                    byTerm.set(term, []);
                }
                if (!byTerm.get(term)!.includes(sc)) {
                    byTerm.get(term)!.push(sc);
                }
            }
        }

        return byTerm;
    }

    /**
     * Group courses by department
     *
     * @returns Map of department code to selected courses
     */
    getCoursesByDepartment(): Map<string, SelectedCourse[]> {
        const byDept = new Map<string, SelectedCourse[]>();

        for (const sc of this.selectedCourses) {
            const dept = sc.course.department?.abbreviation || 'Unknown';
            if (!byDept.has(dept)) {
                byDept.set(dept, []);
            }
            byDept.get(dept)!.push(sc);
        }

        return byDept;
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
            schedule.timestamp || Date.now(),
            schedule.connectedCalendar,
            schedule.localEvents || []
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
            timestamp: this.timestamp,
            connectedCalendar: this.connectedCalendar,
            localEvents: this.localEvents
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
