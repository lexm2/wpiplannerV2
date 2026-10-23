import { AcademicTerm, SelectedCourse } from '../types/schedule';
import { sectionsOf } from './courseUtils';

/** Type guards and validation utilities for runtime data integrity checks. */

/**
 * Safe getter for computed term. Canonical kind order puts the lecture first -
 * the primary component when there is one - then discussion, then lab.
 */
export function getComputedTerm(sc: SelectedCourse): string | null {
  return (
    sectionsOf(sc.selected).find(s => s.computedTerm)?.computedTerm ?? null
  );
}

/** The four quarter terms, in academic-year order. */
export const QUARTERS = [
  AcademicTerm.A,
  AcademicTerm.B,
  AcademicTerm.C,
  AcademicTerm.D,
] as const;
/** Every term a section can have, quarters first. */
export const TERMS = [...QUARTERS, AcademicTerm.F, AcademicTerm.S] as const;

/** QUARTERS as strings, to look up any term in. */
export const QUARTER_TERMS: readonly string[] = [...QUARTERS];
/** Semester terms: F runs through A and B, S through C and D. */
export const SEMESTER_TERMS: readonly string[] = ['F', 'S'];
/** TERMS as strings, to look up any term in. */
export const TERM_ORDER: readonly string[] = [...TERMS];

/** A tooltip for a semester term's badge, which a single letter undersells. */
export function semesterTermLabel(term: string): string | undefined {
  if (term === 'F') return 'Fall semester (A and B terms)';
  if (term === 'S') return 'Spring semester (C and D terms)';
  return undefined;
}

/**
 * Maps a computed term to display terms
 * F (Fall graduate) -> ['A', 'B']
 * S (Spring graduate) -> ['C', 'D']
 * A/B/C/D -> [term]
 */
export function getDisplayTerms(computedTerm: string): string[] {
  if (computedTerm === 'F') {
    return ['A', 'B'];
  } else if (computedTerm === 'S') {
    return ['C', 'D'];
  }
  return [computedTerm];
}
