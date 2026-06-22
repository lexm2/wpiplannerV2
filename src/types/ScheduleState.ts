import type { Course, Section, Department } from './types';
import type { SelectedCourse, ScheduleCombination, Schedule, LocalCalendarEvent, AcademicTerm } from './schedule';
import { getAllSections } from '../utils/courseUtils';

/**
 * Single source of truth for one schedule's data, holding full
 * Course/Section objects for app use.
 */
export class ScheduleState {
    readonly id: string;
    readonly name: string;
    readonly selectedCourses: SelectedCourse[];
    readonly generatedSchedules: ScheduleCombination[];
    readonly timestamp: number;
    readonly localEvents: LocalCalendarEvent[];
    readonly year?: number;

    constructor(
        id: string,
        name: string,
        selectedCourses: SelectedCourse[] = [],
        generatedSchedules: ScheduleCombination[] = [],
        timestamp: number = Date.now(),
        localEvents: LocalCalendarEvent[] = [],
        year?: number
    ) {
        this.id = id;
        this.name = name;
        this.selectedCourses = selectedCourses;
        this.generatedSchedules = generatedSchedules;
        this.timestamp = timestamp;
        this.localEvents = localEvents;
        this.year = year;
    }


    /** Immutable update: copy with the given fields replaced. */
    with(updates: Partial<{
        name: string;
        selectedCourses: SelectedCourse[];
        generatedSchedules: ScheduleCombination[];
        localEvents: LocalCalendarEvent[];
        year: number | undefined;
    }>): ScheduleState {
        return new ScheduleState(
            this.id,
            updates.name ?? this.name,
            updates.selectedCourses ?? this.selectedCourses,
            updates.generatedSchedules ?? this.generatedSchedules,
            Date.now(), // Update timestamp on any change
            updates.localEvents ?? this.localEvents,
            'year' in updates ? updates.year : this.year
        );
    }

    getCourseCount(): number {
        return this.selectedCourses.length;
    }

    isEmpty(): boolean {
        return this.selectedCourses.length === 0;
    }

    containsCourse(courseId: string): boolean {
        return this.selectedCourses.some(sc => sc.course.id === courseId);
    }

    getCourse(courseId: string): SelectedCourse | null {
        return this.selectedCourses.find(sc => sc.course.id === courseId) || null;
    }

    /** Course objects, unwrapped from their SelectedCourse wrappers. */
    getAllCourses(): Course[] {
        return this.selectedCourses.map(sc => sc.course);
    }

    /** All sections across all courses (selected and unselected). */
    getAllSections(): Section[] {
        const sections: Section[] = [];
        for (const selectedCourse of this.selectedCourses) {
            sections.push(...getAllSections(selectedCourse.course));
        }
        return sections;
    }

    /** Only the currently selected sections. */
    getSelectedSections(): Section[] {
        const sections: Section[] = [];
        for (const sc of this.selectedCourses) {
            if (sc.selectedLecture) sections.push(sc.selectedLecture);
            if (sc.selectedDiscussion) sections.push(sc.selectedDiscussion);
            if (sc.selectedLab) sections.push(sc.selectedLab);
        }
        return sections;
    }

    /** Selected sections for a specific term. */
    getSectionsForTerm(term: AcademicTerm): Section[] {
        return this.getSelectedSections().filter(s => s.computedTerm === term);
    }

    getRequiredCourses(): SelectedCourse[] {
        return this.selectedCourses.filter(sc => sc.isRequired);
    }

    getElectiveCourses(): SelectedCourse[] {
        return this.selectedCourses.filter(sc => !sc.isRequired);
    }

    getCoursesWithLockedSections(): SelectedCourse[] {
        return this.selectedCourses.filter(sc => sc.lockedSections.size > 0);
    }

    /** @returns Map of term code to selected courses. */
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

    /** @returns Map of department code to selected courses. */
    getCoursesByDepartment(): Map<string, SelectedCourse[]> {
        const byDept = new Map<string, SelectedCourse[]>();

        for (const sc of this.selectedCourses) {
            const dept = sc.course.departmentAbbr || 'Unknown';
            if (!byDept.has(dept)) {
                byDept.set(dept, []);
            }
            byDept.get(dept)!.push(sc);
        }

        return byDept;
    }

    /** Create from a plain Schedule interface. */
    static fromSchedule(schedule: Schedule): ScheduleState {
        return new ScheduleState(
            schedule.id,
            schedule.name,
            schedule.selectedCourses,
            schedule.generatedSchedules,
            schedule.timestamp || Date.now(),
            schedule.localEvents || [],
            schedule.year
        );
    }

    /** Convert to a plain Schedule interface. */
    toSchedule(): Schedule {
        return {
            id: this.id,
            name: this.name,
            selectedCourses: this.selectedCourses,
            generatedSchedules: this.generatedSchedules,
            timestamp: this.timestamp,
            localEvents: this.localEvents,
            year: this.year
        };
    }
}

/** Find a course by ID across all departments. */
export function findCourseById(courseId: string, departments: Department[]): Course | null {
    for (const dept of departments) {
        const course = dept.courses.find(c => c.id === courseId);
        if (course) return course;
    }
    return null;
}

/** Find a section by CRN within a course. */
export function findSectionByCRN(course: Course, crn: string): Section | null {
    const allSections = getAllSections(course);
    return allSections.find(s => s.crn.toString() === crn) || null;
}
