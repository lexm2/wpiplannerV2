import { Section, SimpleTime } from './types';
import { SelectedCourse } from './schedule';

export interface FilterMetadata {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly priority?: number;
}

export interface SectionFilter<TCriteria = unknown> extends FilterMetadata {
    apply(sections: Section[], criteria: TCriteria, activeFilters?: Map<string, unknown>): Section[];
    isValidCriteria(criteria: unknown): criteria is TCriteria;
    getDisplayValue(criteria: TCriteria): string;
}

export interface SelectedCourseFilter<TCriteria = unknown> extends FilterMetadata {
    apply(selectedCourses: SelectedCourse[], criteria: TCriteria, activeFilters?: Map<string, unknown>): SelectedCourse[];
    isValidCriteria(criteria: unknown): criteria is TCriteria;
    getDisplayValue(criteria: TCriteria): string;
}

export interface BaseFilter<TCriteria = unknown> extends FilterMetadata {
    isValidCriteria(criteria: unknown): criteria is TCriteria;
    getDisplayValue(criteria: TCriteria): string;
}

export interface FilterCriteria {
    [filterId: string]: unknown;
}

export interface ActiveFilter<TCriteria = unknown> {
    id: string;
    name: string;
    criteria: TCriteria;
    displayValue: string;
}

export type FilterChangeEvent<TCriteria = unknown> =
    | {
        type: 'add';
        filterId: string;
        criteria: TCriteria;
        activeFilters: ActiveFilter<unknown>[];
    }
    | {
        type: 'remove';
        filterId: string;
        activeFilters: ActiveFilter<unknown>[];
    }
    | {
        type: 'clear';
        activeFilters: ActiveFilter<unknown>[];
    }
    | {
        type: 'update';
        filterId: string;
        criteria: TCriteria;
        activeFilters: ActiveFilter<unknown>[];
    };

export type FilterEventListener = (event: FilterChangeEvent) => void;

// Standard filter criteria types
export interface DepartmentFilterCriteria {
    departments: string[];
}

export interface AvailabilityFilterCriteria {
    availableOnly: boolean;
    minAvailable?: number;
}

export interface CreditRangeFilterCriteria {
    min: number;
    max: number;
}

export interface ProfessorFilterCriteria {
    professors: string[];
}

export interface TimeSlotFilterCriteria {
    timeSlots: Array<{
        startTime: SimpleTime;
        endTime: SimpleTime;
        days: string[];
    }>;
}

export interface TermFilterCriteria {
    terms: string[];
}


export interface SearchTextFilterCriteria {
    query: string;
}

export interface SectionStatusFilterCriteria {
    status: 'selected' | 'unselected' | 'all';
}

export interface RequiredStatusFilterCriteria {
    status: 'required' | 'optional' | 'all';
}

export interface GraduateLevelFilterCriteria {
    level: 'all' | 'undergraduate' | 'graduate';
}

// Period-based filter criteria
export interface CourseSelectionFilterCriteria {
    selectedCourseIds: string[];
}


export interface PeriodDaysFilterCriteria {
    days: string[];
}

export interface PeriodProfessorFilterCriteria {
    professors: string[];
}

export interface PeriodTypeFilterCriteria {
    types: string[]; // Can be string literals or PeriodType enum values (which are strings)
}

export interface PeriodTermFilterCriteria {
    terms: string[];
}

export interface PeriodAvailabilityFilterCriteria {
    availableOnly: boolean;
    minAvailable?: number;
}

export interface PeriodConflictFilterCriteria {
    avoidConflicts: boolean;
    selectedCourses?: SelectedCourse[]; // Array of SelectedCourse objects for context-aware conflict detection
}

export interface ConflictFilterCriteria {
    avoidConflicts: boolean;
    blockedSlots: import('./schedule').WeeklyTimeSlot[];
}

export interface SectionCodeFilterCriteria {
    codes: string[];
}

export interface RMPRatingFilterCriteria {
    minRating?: number;         // Minimum average rating (0-5 scale)
    maxRating?: number;         // Maximum average rating (0-5 scale)
    minDifficulty?: number;     // Minimum difficulty rating (0-5 scale)
    maxDifficulty?: number;     // Maximum difficulty rating (0-5 scale)
    minWouldTakeAgain?: number; // Minimum "would take again" percentage (0-100)
    maxWouldTakeAgain?: number; // Maximum "would take again" percentage (0-100)
    includeWithoutData?: boolean; // Include professors without RMP data (default: true)
}

export interface BookmarkFilterCriteria {
    showBookmarkedOnly: boolean;
}

export interface BlockedTimesFilterCriteria {
    blockedTimes: Array<{
        id: string;
        day: string;
        startTime: SimpleTime;
        endTime: SimpleTime;
        term: string;
    }>;
}

export interface WakeUpTimeFilterCriteria {
    wakeUpTime: SimpleTime;
}