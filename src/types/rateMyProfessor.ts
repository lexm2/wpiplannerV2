/**
 * The contract for public/rateMyProfessor.json, shared so the two sides cannot
 * drift: scripts/rateMyProfessor/fetchRateMyProfessor.ts writes the file and
 * services/external/RateMyProfessorService.ts reads it.
 */
import { z } from 'zod';

export interface Professor {
  id: string;
  legacyId: number;
  firstName: string;
  lastName: string;
  department: string;
  avgRating: number;
  avgDifficulty: number;
  numRatings: number;
  wouldTakeAgainPercent: number | null;
  profileUrl: string;
}

export interface School {
  id: string;
  name: string;
  city?: string;
  state?: string;
}

export interface RateMyProfessorData {
  lastUpdated: string;
  school: School;
  professors: Professor[];
  totalProfessors: number;
}

const ProfessorSchema = z.object({
  id: z.string(),
  legacyId: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  department: z.string(),
  avgRating: z.number(),
  avgDifficulty: z.number(),
  numRatings: z.number(),
  wouldTakeAgainPercent: z.number().nullable(),
  profileUrl: z.string(),
}) satisfies z.ZodType<Professor>;

const SchoolSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string().optional(),
  state: z.string().optional(),
}) satisfies z.ZodType<School>;

export const RateMyProfessorDataSchema = z.object({
  lastUpdated: z.string(),
  school: SchoolSchema,
  professors: z.array(ProfessorSchema),
  totalProfessors: z.number(),
}) satisfies z.ZodType<RateMyProfessorData>;
