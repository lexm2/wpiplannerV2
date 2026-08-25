import { SelectedCourse } from '../types/schedule';
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
