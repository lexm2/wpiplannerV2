import { Course, Section } from './types'

export interface SelectedCourse {
    course: Course;
    selectedLecture: Section | null;
    selectedDiscussion: Section | null;
    selectedLab: Section | null;
    selectedSection: Section | null;
    selectedSectionNumber: string | null;
    isRequired: boolean;
}

export interface Schedule {
    id: string;
    name: string;
    selectedCourses: SelectedCourse[];
    generatedSchedules: ScheduleCombination[];
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

export interface ScheduleScore {
    totalScore: number;
    timeGapScore: number;
    compactnessScore: number;
    timePreferenceScore: number;
    consecutiveClassScore: number;
    buildingTransitionScore: number;
    balancedLoadScore: number;
}

export interface ScoreWeights {
    timeGap: number;
    compactness: number;
    timePreference: number;
    consecutiveClass: number;
    buildingTransition: number;
    balancedLoad: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
    timeGap: 0.25,
    compactness: 0.20,
    timePreference: 0.20,
    consecutiveClass: 0.15,
    buildingTransition: 0.10,
    balancedLoad: 0.10
};