/**
 * "Did you mean" for instructor names. A name search matches words
 * exactly (namesHaveWord), which is right for finding a person but leaves
 * "Gilian Smith" and "Gillian Smth" with nothing; a suggestion names the
 * instructor meant without making every name search fuzzy.
 */
import type { Course } from '../types/types';
import { getAllSections } from '../utils/courseUtils';
import { editDistance } from '../utils/editDistance';
import { foldText } from '../utils/searchUtils';

/** Names suggested at most. */
const MAX_SUGGESTIONS = 3;

// Accents folded, as the search folds them: "Neel" is near "EJ Néel".
const words = (text: string) =>
  foldText(text)
    .split(/[^a-z]+/)
    .filter(Boolean);

/**
 * Edits a query word may be off by: one from 4 letters ("Smth" for
 * Smith), two from 8; shorter words must match the start of a name word.
 */
const allowance = (word: string) =>
  word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0;

/** How far `query` is from `name`, word for word; null when too far. */
function nameDistance(query: string[], name: string[]): number | null {
  let total = 0;
  for (const word of query) {
    const best = Math.min(
      ...name.map(n =>
        n.startsWith(word) ? 0 : editDistance(word, n, allowance(word)),
      ),
    );
    if (best > allowance(word)) return null;
    total += best;
  }
  return total;
}

/** Instructors of `courses` whose names are near `query`, nearest first. */
export function suggestInstructors(courses: Course[], query: string): string[] {
  const want = words(query);
  // A name is a word or three; a longer query is about something else.
  if (!want.length || want.length > 3) return [];
  const names = new Set<string>();
  for (const course of courses) {
    for (const section of getAllSections(course)) {
      for (const period of section.periods) {
        for (const name of period.instructors) names.add(name);
      }
    }
  }
  return [...names]
    .map(name => ({ name, distance: nameDistance(want, words(name)) }))
    .filter(
      (x): x is { name: string; distance: number } =>
        x.distance !== null && x.distance > 0,
    )
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, MAX_SUGGESTIONS)
    .map(x => x.name);
}
