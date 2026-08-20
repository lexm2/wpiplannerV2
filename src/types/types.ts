import { AcademicTerm } from "./schedule";

// A lecture section with the discussions/labs compatible with it.
export interface LectureGroup {
    section: Section;
    compatibleDiscussions: Section[];
    compatibleLabs: Section[];
}

export interface Course {
    id: string;
    number: string;
    name: string;
    description: string;
    category?: 1 | 2 | 3 | null;
    departmentAbbr: string;
    departmentName: string;
    lectures?: LectureGroup[];
    standaloneLabs?: Section[];
    minCredits: number;
    maxCredits: number;
    isGraduate?: boolean;
    academicYear?: number;
    transient?: boolean;
}

export interface Department {
    abbreviation: string;
    name: string;
    courses: Course[];
}

export interface Section {
    crn: number;
    number: string;
    seats: number;
    seatsAvailable: number;
    actualWaitlist: number;
    maxWaitlist: number;
    note?: string;
    computedTerm: AcademicTerm; // A, B, C, D, E, F
    isInterestList?: boolean; // placeholder section for an interest list
    periods: Period[];
}

/**
 * The component slots a course selection can fill. Ordered: anything that walks
 * a selection lecture-first relies on this order, so iterate COMPONENT_KINDS
 * rather than Object.keys/values, whose order follows insertion.
 *
 * Distinct from {@link SectionType}, which is the catalog's four-way tag
 * (it splits standaloneLab out) attached externally by the filter pipeline. A
 * standalone lab fills the 'lab' slot here — that is a selection-model fact,
 * not a catalog one.
 */
export const COMPONENT_KINDS = ['lecture', 'discussion', 'lab'] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

/** A course's chosen section per component kind. Unfilled kinds are absent keys. */
export type SectionsByKind = Partial<Record<ComponentKind, Section>>;

/** @see COMPONENT_KINDS for the selection-side three-way split. */
export enum SectionType {
    LECTURE = 'lecture',
    STANDALONE_LAB = 'standaloneLab',
    DISCUSSION = 'discussion',
    LAB = 'lab'
}

export enum PeriodType {
    LECTURE = 'Lecture',
    LAB = 'Lab',
    DISCUSSION = 'Discussion',
    SEMINAR = 'Seminar',
    WORKSHOP = 'Workshop',
    EXPERIENTIAL = 'Experiential',
    INDEPENDENT_STUDY = 'Independent Study',
    INTERNSHIP = 'Internship',
    RESEARCH = 'Research',
    THESIS = 'Thesis'
}

export interface Period {
    type: PeriodType;
    professor: string;
    professorEmail?: string;
    startTime: Time;
    endTime: Time;
    location: string;
    building: string;
    room: string;
    seats: number;
    seatsAvailable: number;
    actualWaitlist: number;
    maxWaitlist: number;
    days: Set<DayOfWeek>;
    specificSection?: string;
    isAsync?: boolean;
}

export interface Time {
    hours: number;
    minutes: number;
    displayTime: string;
}

export type SimpleTime = Omit<Time, 'displayTime'>;

export interface TimeSlot {
    startTime: SimpleTime;
    endTime: SimpleTime;
    days: DayOfWeek[];
}

export enum DayOfWeek {
    MONDAY = 'M',
    TUESDAY = 'T',
    WEDNESDAY = 'W',
    THURSDAY = 'R',
    FRIDAY = 'F',
    SATURDAY = 'S',
    SUNDAY = 'U'
}

export interface ScheduleDB {
    departments: Department[];
    generated: string;
}

export interface PlannerState {
    courses: Course[];
    selectedYear: number;
    searchTerm: string;
    activeFilters: string[];
    plan: {
        [year: number]: {
            fall: Course[];
            spring: Course[];
            summer: Course[];
        };
    };
}

export enum Semester {
    FALL = 'fall',
    SPRING = 'spring',
    SUMMER = 'summer'
}