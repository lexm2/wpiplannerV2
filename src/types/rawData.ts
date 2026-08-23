/**
 * Raw JSON data types from the course-data-constructed.json file.
 * Used during parsing before transformation into domain types.
 */

export interface RawPeriod {
  type?: string;
  professor?: string;
  startTime: string;
  endTime: string;
  location?: string;
  building?: string;
  room?: string;
  seats?: number;
  seatsAvailable?: number;
  actualWaitlist?: number;
  maxWaitlist?: number;
  days?: string[];
  specificSection?: string;
  isAsync?: boolean;
}

export interface RawSection {
  crn?: number;
  number?: string;
  seats?: number;
  seatsAvailable?: number;
  actualWaitlist?: number;
  maxWaitlist?: number;
  note?: string;
  computedTerm?: string;
  isInterestList?: boolean;
  periods?: RawPeriod[];
}

export interface RawLectureGroup {
  section: RawSection;
  compatibleDiscussions?: RawSection[];
  compatibleLabs?: RawSection[];
}

export interface RawCourse {
  id: string;
  number: string;
  name: string;
  description?: string;
  category?: 1 | 2 | 3 | null;
  lectures?: RawLectureGroup[];
  standaloneLabs?: RawSection[];
  minCredits?: number;
  maxCredits?: number;
  isGraduate?: boolean;
  academicYear?: number;
}

export interface RawDepartment {
  abbreviation: string;
  name: string;
  courses: RawCourse[];
}
