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
    min_credits: number;
    max_credits: number;
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
    seats_available: number;
    actual_waitlist: number;
    max_waitlist: number;
    note: string | null;
    description: string;
    term: string;
    computedTerm: string;
    is_gps: boolean;
    is_interest_list: boolean;
    periods: PlannerPeriod[];
}

export interface PlannerPeriod {
    type: string;
    professor: string;
    start_time: string;
    end_time: string;
    location: string;
    building: string;
    room: string;
    seats: number;
    seats_available: number;
    actual_waitlist: number;
    max_waitlist: number;
    specific_section: string;
    days: string[];
}
