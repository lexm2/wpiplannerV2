import { AcademicTerm } from "./schedule";

// Hierarchical course structure with lecture groups and compatible discussions/labs.
export interface LectureGroup {
    section: Section;                 // The lecture section itself
    compatibleDiscussions: Section[]; // Discussions that work with this lecture
    compatibleLabs: Section[];        // Labs that work with this lecture
}

export interface Course {
    id: string;
    number: string;
    name: string;
    description: string;
    department: Department;
    lectures?: LectureGroup[];
    standaloneLabs?: Section[];
    minCredits: number;
    maxCredits: number;
    isGraduate?: boolean;
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
    description: string;
    term: string;
    computedTerm: AcademicTerm; // Computed academic term letter (A, B, C, D, E, F)
    isInterestList?: boolean; // True for interest list placeholder sections
    periods: Period[];
}

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