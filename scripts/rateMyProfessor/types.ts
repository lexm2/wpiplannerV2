/**
 * Rate My Professors API response shapes, used only while scraping.
 *
 * The output contract (Professor, School, RateMyProfessorData) lives in
 * src/types/rateMyProfessor.ts, because the app reads the file this produces.
 */
export type {
  Professor,
  School,
  RateMyProfessorData,
} from '../../src/types/rateMyProfessor';

/**
 * API response types from @mtucourses/rate-my-professors
 */
export interface RMPSchoolResult {
  city: string;
  id: string;
  name: string;
  state: string;
}

export interface RMPTeacherSearchResult {
  firstName: string;
  id: string;
  lastName: string;
  school: {
    id: string;
    name: string;
  };
}

export interface RMPTeacherDetails {
  id: string;
  firstName: string;
  lastName: string;
  avgDifficulty: number;
  avgRating: number;
  numRatings: number;
  department: string;
  school: RMPSchoolResult;
  legacyId: number;
  wouldTakeAgainPercent?: number | null;
  [key: string]: unknown; // Allow for additional fields
}
