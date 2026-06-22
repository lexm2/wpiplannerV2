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
                    ...sections,
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

    /** Immutable update: copy with the given fields replaced. */
    with(updates: Partial<{
        activeScheduleId: string | null;
        schedules: ScheduleState[];
        preferences: SchedulePreferences;
    }>): ApplicationState {
        return new ApplicationState(
            updates.activeScheduleId ?? this.activeScheduleId,
            updates.schedules ?? this.schedules,
            updates.preferences ?? this.preferences,
            this.version,
            Date.now() // Update timestamp
        );
    }

    getActiveSchedule(): ScheduleState | null {
        if (!this.activeScheduleId) return null;
        return this.schedules.find(s => s.id === this.activeScheduleId) || null;
    }

    /** Index of the active schedule, or 0 if none. */
    getActiveScheduleIndex(): number {
        if (!this.activeScheduleId) return 0;
        const index = this.schedules.findIndex(s => s.id === this.activeScheduleId);
        return index >= 0 ? index : 0;
    }

    getSchedule(scheduleId: string): ScheduleState | null {
        return this.schedules.find(s => s.id === scheduleId) || null;
    }

    /** Add the schedule, or replace the existing one with the same id. */
    upsertSchedule(schedule: ScheduleState): ApplicationState {
        const existingIndex = this.schedules.findIndex(s => s.id === schedule.id);
        const newSchedules = [...this.schedules];

        if (existingIndex >= 0) {
            newSchedules[existingIndex] = schedule;
        } else {
            newSchedules.push(schedule);
        }

        return this.with({ schedules: newSchedules });
    }

    removeSchedule(scheduleId: string): ApplicationState {
        const newSchedules = this.schedules.filter(s => s.id !== scheduleId);
        const newActiveScheduleId = this.activeScheduleId === scheduleId
            ? null
            : this.activeScheduleId;

        return new ApplicationState(
            newActiveScheduleId,
            newSchedules,
            this.preferences,
            this.version,
            Date.now()
        );
    }

    getScheduleCount(): number {
        return this.schedules.length;
    }

    hasSchedule(scheduleId: string): boolean {
        return this.schedules.some(s => s.id === scheduleId);
    }

    findScheduleByName(name: string): ScheduleState | null {
        return this.schedules.find(s => s.name === name) || null;
    }

    getAllScheduleNames(): string[]  {
        return this.schedules.map(s => s.name);
    }

    /**
     * Whether no other schedule has this name.
     * @param excludeId - Schedule ID to exclude from the check (for renames)
     */
    hasUniqueScheduleName(name: string, excludeId?: string): boolean {
        return !this.schedules.some(s => s.name === name && s.id !== excludeId);
    }

    /**
     * Make baseName unique by appending a counter.
     * e.g. "My Schedule (1)" if "My Schedule" already exists.
     */
    generateUniqueScheduleName(baseName: string): string {
        if (this.hasUniqueScheduleName(baseName)) {
            return baseName;
        }

        let counter = 1;
        let candidateName: string;
        do {
            candidateName = `${baseName} (${counter})`;
            counter++;
        } while (!this.hasUniqueScheduleName(candidateName));

        return candidateName;
    }

    /** Total courses across all schedules. */
    getTotalCourseCount(): number {
        return this.schedules.reduce((sum, schedule) => sum + schedule.getCourseCount(), 0);
    }

    /** Schedules sorted alphabetically by name. */
    getSchedulesSortedByName(): ScheduleState[] {
        return [...this.schedules].sort((a, b) => a.name.localeCompare(b.name));
    }

    /** Schedules sorted by timestamp, most recent first. */
    getSchedulesSortedByTimestamp(): ScheduleState[] {
        return [...this.schedules].sort((a, b) => b.timestamp - a.timestamp);
    }

    /** Schedules with no courses. */
    getEmptySchedules(): ScheduleState[] {
        return this.schedules.filter(s => s.isEmpty());
    }
}
