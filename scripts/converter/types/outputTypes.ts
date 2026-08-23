/**
 * Type definitions for the hierarchical planner JSON output format
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

export interface PlannerCourse {
  id: string;
  number: string;
  name: string;
  description: string;
  category: 1 | 2 | 3 | null;
  minCredits: number;
  maxCredits: number;
  isGraduate: boolean;
  academicYear: number;
  lectures: LectureGroup[];
  standaloneLabs?: PlannerSection[];
}

export interface LectureGroup {
  section: PlannerSection;
  compatibleDiscussions: PlannerSection[];
  compatibleLabs: PlannerSection[];
}

export interface PlannerSection {
  crn: number;
  number: string;
  seats: number;
  seatsAvailable: number;
  actualWaitlist: number;
  maxWaitlist: number;
  note: string | null;
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
  isAsync: boolean;
}
