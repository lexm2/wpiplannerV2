export interface Course {
    id: string;
    number: string;
    name: string;
    description: string;
    department: Department;
    sections: Section[];
    minCredits: number;
    maxCredits: number;
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
    periods: Period[];
}
export interface Period {
    type: string;
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
    days: DayOfWeek[];
    specificSection?: string;
}
export interface Time {
    hours: number;
    minutes: number;
    displayTime: string;
}
export declare enum DayOfWeek {
    MONDAY = "mon",
    TUESDAY = "tue",
    WEDNESDAY = "wed",
    THURSDAY = "thu",
    FRIDAY = "fri",
    SATURDAY = "sat",
    SUNDAY = "sun"
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
export type Semester = 'fall' | 'spring' | 'summer';
//# sourceMappingURL=types.d.ts.map