import { Course, Section } from './types'

export interface SelectedCourse {
    course: Course;
    preferredSections: string[];
    deniedSections: string[];
    isRequired: boolean;
}

export interface Schedule {
    id: string;
    name: string;
    selectedCourses: SelectedCourse[];
    generatedSchedules: ScheduleCombination[];
    preferences: SchedulePreferences;
}

export interface ScheduleCombination {
    id: string;
    sections: Section[];
    conflicts: TimeConflict[];
    isValid: boolean;
    score: number;
}

export interface TimeConflict {
    section1: Section;
    section2: Section;
    conflictType: ConflictType;
    description: string;
}

export interface SchedulePreferences {
    preferredTimeRange: {
        startTime: { hours: number; minutes: number };
        endTime: { hours: number; minutes: number };
    };
    preferredDays: Set<string>;
    avoidBackToBackClasses: boolean;
    maxDailyHours: number;
    preferredBuildings: string[];
}

export enum ConflictType {
    TIME_OVERLAP = 'time_overlap',
    SAME_PERIOD = 'same_period',
    INSUFFICIENT_BREAK = 'insufficient_break'
}

export interface UserScheduleState {
    activeSchedule: Schedule | null;
    savedSchedules: Schedule[];
    preferences: SchedulePreferences;
}