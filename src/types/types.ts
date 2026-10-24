import { AcademicTerm } from './schedule';

// A lecture section with the discussions/labs compatible with it.
export interface LectureGroup {
  section: Section;
  compatibleDiscussions: Section[];
  compatibleLabs: Section[];
}

/** A course the catalog says runs every other academic year. */
export interface AlternatingYears {
  /** Fall year of the academic year it names: 2020 for 2020-21. */
  firstYear: number;
  /** The description's sentence, as written. */
  statement: string;
}

export interface Course {
  id: string;
  number: string;
  name: string;
  description: string;
  /** WPI offering category: I every year, II every other year, III occasionally. */
  category?: 1 | 2 | 3 | null;
  /** Degree requirements its sections count toward, e.g. "Social Sciences". */
  degreeAttributes: string[];
  /** Kinds of course, e.g. "Special Topic", "Music", "Experimental". */
  courseTypes: string[];
  /**
   * Other codes the same sections are listed under (DS 502 / MA 543): one
   * class, register under either code.
   */
  crossListedWith: string[];
  /**
   * What the description recommends having taken, lifted from its
   * "Recommended background: ..." prose. Still part of the description.
   */
  recommendedBackground?: string;
  /** The description's "Prerequisite(s): ..." statement, likewise. */
  prerequisites?: string;
  /**
   * The description's "offered in 2020-21, and in alternating years
   * thereafter", read when the course loads.
   */
  alternatingYears?: AlternatingYears | null;
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
  /** Part of WPI's online graduate offering. */
  isOnlineGrad: boolean;
  /**
   * Separate sections, often of another course or level, that meet in the
   * same room at the same time, e.g. "BB 550-C01" for BB 4050-C01.
   */
  meetsWith: string[];
  /** "In-Person", "Online" or "Hybrid"; empty when the catalog does not say. */
  deliveryMode: string;
  /** Registration status: "Open", "Waitlist" or "Closed"; empty when unknown. */
  status: string;
  /** First and last day the section meets, YYYY-MM-DD; empty when unknown. */
  startDate: string;
  endDate: string;
  periods: Period[];
}

/**
 * The component slots a course selection can fill. Ordered: anything that walks
 * a selection lecture-first relies on this order, so iterate COMPONENT_KINDS
 * rather than Object.keys/values, whose order follows insertion.
 *
 * Distinct from {@link SectionType}, which is the catalog's four-way tag
 * (it splits standaloneLab out) attached externally by the filter pipeline. A
 * standalone lab fills the 'lab' slot here - that is a selection-model fact,
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
  LAB = 'lab',
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
  THESIS = 'Thesis',
}

export interface Period {
  type: PeriodType;
  /** Named instructors, co-instructors each their own; empty when none is assigned. */
  instructors: string[];
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

export enum DayOfWeek {
  MONDAY = 'M',
  TUESDAY = 'T',
  WEDNESDAY = 'W',
  THURSDAY = 'R',
  FRIDAY = 'F',
  SATURDAY = 'S',
  SUNDAY = 'U',
}

export interface ScheduleDB {
  departments: Department[];
  generated: string;
}
