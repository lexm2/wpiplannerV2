/**
 * Types for Rate My Professor data structures
 */

/**
 * Professor data from Rate My Professors API
 */
export interface Professor {
  id: string;
  firstName: string;
  lastName: string;
  department: string;
  avgRating: number;
  avgDifficulty: number;
  numRatings: number;
  wouldTakeAgainPercent: number | null;
}

/**
 * School information
 */
export interface School {
  id: string;
  name: string;
  city?: string;
  state?: string;
}

/**
 * Complete Rate My Professor data export format
 */
export interface RateMyProfessorData {
  lastUpdated: string; // ISO 8601 timestamp
  school: School;
  professors: Professor[];
  totalProfessors: number;
}

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
  [key: string]: any; // Allow for additional fields
}
