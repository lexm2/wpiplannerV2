import type { Department, ScheduleDB } from '../../types';

export type CourseDataEventType = 'data-loaded' | 'data-refreshed';

export interface CourseDataEvent {
    type: CourseDataEventType;
    timestamp: number;
    departments: Department[];
    scheduleDB: ScheduleDB;
}

export type CourseDataEventListener = (event: CourseDataEvent) => void;
