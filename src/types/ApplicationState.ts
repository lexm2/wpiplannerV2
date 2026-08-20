import type { Department } from './types';
import type { SchedulePreferences } from './schedule';
import type { MinimalSyncData } from './export';
import { ScheduleState, findCourseById } from './ScheduleState';
import type { SelectedCourse } from './schedule';
import { encodeCourseSelection, decodeCourseSelection } from '../utils/courseUtils';

const APPLICATION_STATE_VERSION: string = '4.3'

/**
 * Application-level state: all schedules plus preferences.
 * The complete exportable/importable unit, with conversion to/from export format.
 */
export class ApplicationState {
    readonly version: string;
    readonly timestamp: number;
    readonly activeScheduleId: string | null;
    readonly schedules: ScheduleState[];
    readonly preferences?: SchedulePreferences;

    constructor(
        activeScheduleId: string | null,
        schedules: ScheduleState[],
        preferences?: SchedulePreferences,
        version: string = APPLICATION_STATE_VERSION,
        timestamp: number = Date.now()
    ) {
        this.version = version;
        this.timestamp = timestamp;
        this.activeScheduleId = activeScheduleId;
        this.schedules = schedules;
        this.preferences = preferences;
    }

    /** Convert to minimal format for export. */
    toMinimalFormat(): MinimalSyncData {
        return {
            v: this.version,
            a: this.getActiveScheduleIndex(),
            s: this.schedules.map(schedule => {
                const tuple: [string, (string | null)[], number?] = [
                    schedule.name,
                    schedule.selectedCourses.flatMap(course => encodeCourseSelection(course))
                ];
                if (schedule.year !== undefined) {
                    tuple.push(schedule.year);
                }
                return tuple;
            }),
            p: this.preferences?.theme ? {
                t: [0, 0] as [number, number],
                d: [],
                th: this.preferences.theme
            } : undefined
        };
    }


    /**
     * Hydrate from minimal export format using the department catalog.
     */
    static fromMinimalFormat(
        data: MinimalSyncData,
        courseCatalog: Department[]
    ): ApplicationState {
        const schedules = data.s.map(([name, coursesArray, year]) => {
            const selectedCourses: SelectedCourse[] = [];

            for (let i = 0; i < coursesArray.length; i += 4) {
                const courseId = coursesArray[i];
                if (!courseId) continue;

                const course = findCourseById(courseId, courseCatalog);
                if (!course) {
                    throw new Error(`Course ${courseId} not found in catalog`);
                }

                const sections = decodeCourseSelection(
                    coursesArray[i + 1],
                    coursesArray[i + 2],
                    coursesArray[i + 3],
                    course
                );

                selectedCourses.push({
                    course,
                    selected: sections,
                    isRequired: false,
                    lockedSections: new Set()
                });
            }

            return new ScheduleState(
                `schedule_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                name,
                selectedCourses,
                [],
                Date.now(),
                [],
                year
            );
        });

        const activeScheduleId = data.a !== null ? (schedules[data.a]?.id ?? null) : null;

        const preferences: SchedulePreferences | undefined = data.p?.th ? {
            theme: data.p.th,
            bookmarkedCourseIds: []
        } : undefined;

        return new ApplicationState(
            activeScheduleId,
            schedules,
            preferences,
            data.v,
            Date.now()
        );
    }

    /** Index of the active schedule, or 0 if none. */
    getActiveScheduleIndex(): number {
        if (!this.activeScheduleId) return 0;
        const index = this.schedules.findIndex(s => s.id === this.activeScheduleId);
        return index >= 0 ? index : 0;
    }

}
