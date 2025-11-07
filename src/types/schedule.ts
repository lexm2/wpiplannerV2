import { Course, Section } from './types'

export interface SelectedCourse {
    course: Course;
    selectedLecture: Section | null;
    selectedDiscussion: Section | null;
    selectedLab: Section | null;
    selectedSection: Section | null;
    selectedSectionNumber: string | null;
    isRequired: boolean;
    lockedSections: Set<string>;
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
    earlyMorningPenalty: number;
    professorRatingScore: number;
    classesPerTermScore: number;
}

export interface ScoreWeights {
    professorRating: number;
    earlyMorning: number;
    classesPerTerm: number;
    timeGap: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
    professorRating: 0.25,
    earlyMorning: 0.10,
    classesPerTerm: 0.50,
    timeGap: 0.15
};