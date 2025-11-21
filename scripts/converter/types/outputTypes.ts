/**
 * Type definitions for the hierarchical planner JSON output format
 * Implements the new lecture-centered structure with compatibility lists
 */

export interface PlannerOutput {
    generated: string;
    departments: PlannerDepartment[];
}

export interface PlannerDepartment {
    abbreviation: string;
    name: string;
    courses: PlannerCourse[];
}

/**
 * NEW HIERARCHICAL STRUCTURE
 * Courses now contain lecture groups instead of flat combined sections
 */
export interface PlannerCourse {
    id: string;
    number: string;
    name: string;
    description: string;
    minCredits: number;
    maxCredits: number;
    isGraduate: boolean;
    lectures: LectureGroup[];          // NEW: Main structure
    standaloneLabs?: PlannerSection[]; // NEW: For lab-only courses
}

/**
 * NEW: Groups a lecture with its compatible discussions and labs
 * Replaces the old combined section approach
 */
export interface LectureGroup {
    section: PlannerSection;                 // The lecture section itself
    compatibleDiscussions: PlannerSection[]; // Discussions that work with this lecture
    compatibleLabs: PlannerSection[];        // Labs that work with this lecture
}

export interface PlannerSection {
    crn: number;
    number: string;
    seats: number;
    seatsAvailable: number;
    actualWaitlist: number;
    maxWaitlist: number;
    note: string | null;
    description: string;
    term: string;
    computedTerm: string;
    isGps: boolean;
    isInterestList: boolean;
    periods: PlannerPeriod[];
}

export interface PlannerPeriod {
    type: string;
    professor: string;
    startTime: string;
    endTime: string;
    location: string;
    building: string;
    room: string;
    seats: number;
    seatsAvailable: number;
    actualWaitlist: number;
    maxWaitlist: number;
    specificSection: string;
    days: string[];
}
