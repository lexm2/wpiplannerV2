import { Course } from './types';

export interface CourseFilter {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    
    apply(courses: Course[], criteria: any): Course[];
    isValidCriteria(criteria: any): boolean;
    getDisplayValue(criteria: any): string;
}

export interface FilterCriteria {
    [filterId: string]: any;
}

export interface ActiveFilter {
    id: string;
    name: string;
    criteria: any;
    displayValue: string;
}

export interface FilterChangeEvent {
    type: 'add' | 'remove' | 'clear' | 'update';
    filterId?: string;
    criteria?: any;
    activeFilters: ActiveFilter[];
}

export type FilterEventListener = (event: FilterChangeEvent) => void;

// Standard filter criteria types
export interface DepartmentFilterCriteria {
    departments: string[];
}

export interface AvailabilityFilterCriteria {
    availableOnly: boolean;
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
        startTime: { hours: number; minutes: number };
        endTime: { hours: number; minutes: number };
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

// Period-based filter criteria
export interface CourseSelectionFilterCriteria {
    selectedCourseIds: string[];
}

export interface PeriodTimeFilterCriteria {
    startTime?: { hours: number; minutes: number };
    endTime?: { hours: number; minutes: number };
}

export interface PeriodDaysFilterCriteria {
    days: string[];
}

export interface PeriodProfessorFilterCriteria {
    professors: string[];
}

export interface PeriodTypeFilterCriteria {
    types: string[];
}


export interface PeriodAvailabilityFilterCriteria {
    availableOnly: boolean;
    minAvailable?: number;
}

export interface PeriodConflictFilterCriteria {
    avoidConflicts: boolean;
}

export interface SectionCodeFilterCriteria {
    codes: string[];
}