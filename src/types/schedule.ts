import { Course, Section } from './types'

export interface SelectedCourse {
    course: Course;
    selectedSection: string | null;
    preferredSections: Set<string>;
    deniedSections: Set<string>;
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
    theme?: string;
}

export enum ConflictType {
    TIME_OVERLAP = 'time_overlap'
}

export interface UserScheduleState {
    activeSchedule: Schedule | null;
    savedSchedules: Schedule[];
    preferences: SchedulePreferences;
}