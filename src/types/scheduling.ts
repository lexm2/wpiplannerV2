import type { Course, Section, Period, SectionsByKind } from './types';
import type { SelectedCourse, DisplayableTimeSlot } from './schedule';

/**
 * Component selections paired with a course.
 * Used for batch operations like auto-schedule apply and bulk section updates.
 */
export interface CourseComponentSelections {
    course: Course;
    selected: SectionsByKind;
}

/**
 * Section occupying a time slot on the schedule grid.
 */
export interface SectionOccupant {
    course: SelectedCourse;
    section: Section;
    periodsOnThisDay: Period[];
    startSlot: number;
    endSlot: number;
    isFirstSlot: boolean;
    startMinutes: number;
    endMinutes: number;
    isPreview: boolean;
}

/**
 * Calendar event occupying a time slot on the schedule grid.
 */
export interface CalendarOccupant {
    slot: DisplayableTimeSlot;
    startSlot: number;
    endSlot: number;
    isFirstSlot: boolean;
    startMinutes: number;
    endMinutes: number;
}

/**
 * Data for a single cell in the schedule grid.
 */
export interface CellData {
    sections: SectionOccupant[];
    calendar: CalendarOccupant[];
}

/**
 * Rendered content for a schedule grid cell (cached for performance).
 */
export interface CellContentResult {
    content: string;
    classes: string;
    hasConflict: boolean;
}

/**
 * A section candidate with its bitmask for conflict detection.
 * Used in the auto-scheduler's backtracking algorithm.
 */
export interface SectionCandidate {
    section: Section | null;
    mask: bigint;
}
