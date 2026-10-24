/**
 * Type definitions for the hierarchical planner JSON output format
 */

// No generation timestamp: the output depends only on the input, so an
// unchanged feed converts to an identical file. last-updated.json carries
// the time instead.
export interface PlannerOutput {
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
  /** Offering Pattern tag first, then a "Cat. I" marker in the description. */
  category: 1 | 2 | 3 | null;
  /** "Degree Attribute" tags across the sections, e.g. "Social Sciences". */
  degreeAttributes: string[];
  /** "Course Type" tags across the sections, e.g. "Special Topic", "Music". */
  courseTypes: string[];
  /** Other course codes listing the same sections under their own code. */
  crossListedWith: string[];
  /** The description's "Recommended background: ..." statement. */
  recommendedBackground?: string;
  /** The description's "Prerequisite(s): ..." statement. */
  prerequisites?: string;
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
  /** Part of WPI's online graduate offering ("Online Grad Course" tag). */
  isOnlineGrad: boolean;
  /** Co-located sections that meet with this one, e.g. "BB 550-C01". */
  meetsWith: string[];
  /** Workday's Delivery_Mode: "In-Person", "Online" or "Hybrid". */
  deliveryMode: string;
  /** Workday's Section_Status: "Open", "Waitlist" or "Closed". */
  status: string;
  /** First and last day of the section, YYYY-MM-DD. */
  startDate: string;
  endDate: string;
  periods: PlannerPeriod[];
}

export interface PlannerPeriod {
  type: string;
  /** Workday's Instructors, "A; B" split; empty when none is assigned. */
  instructors: string[];
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
