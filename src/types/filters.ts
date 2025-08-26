import { Course, Section } from './types';
import { SelectedCourse } from './schedule';

export interface BaseFilter {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    isValidCriteria(criteria: any): boolean;
    getDisplayValue(criteria: any): string;
}

export interface CourseFilter extends BaseFilter {
    apply(courses: Course[], criteria: any, additionalData?: any): Course[];
}

export interface SectionFilter extends BaseFilter {
    applyToSections(sections: Section[], criteria: any): Section[];
    applyToSectionsWithContext?(sectionsWithContext: Array<{course: SelectedCourse, section: Section}>, criteria: any): Array<{course: SelectedCourse, section: Section}>;
}

export interface SelectedCourseFilter extends BaseFilter {
    applyToSelectedCourses(selectedCourses: SelectedCourse[], criteria: any): SelectedCourse[];
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


export interface PeriodDaysFilterCriteria {
    days: string[];
}

export interface PeriodProfessorFilterCriteria {
    professors: string[];
}

export interface PeriodTypeFilterCriteria {
    types: string[];
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
}

export interface SectionCodeFilterCriteria {
    codes: string[];
}