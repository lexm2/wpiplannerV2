import { Course } from '../types/types';
import { getAllSections } from './courseUtils';
import { editDistance } from './editDistance';

/**
 * Text search over courses, shared by SearchTextFilter (what matches) and
 * the relevance ranking (in what order), so the two always agree.
 *
 * A query is either a course code, matched by prefix ("MA 1022", "ma1022",
 * "CS 21" for every CS 21xx, or a bare number "1022"), or words. Every word
 * must match somewhere in the course (its code, name, description,
 * department, degree attributes, course types or cross-listed codes) or in
 * the section (instructor, room, section number): "game design" needs both
 * words. A word of five letters or more also matches with one typo ("robtics",
 * "robotcs"), and nine or more with two.
 */

export interface ParsedQuery {
  /** Lowercased and trimmed, inner whitespace collapsed. */
  text: string;
  words: string[];
  /** Set when the whole query reads as a course code or number. */
  code: { dept: string; number: string } | null;
}

// "ma1022", "cs21", "ds502", "1022"; 2-5 letter departments (IMGD, BCB...).
const CODE_RE = /^([a-z]{2,5})?(\d{2,4}[a-z]?)$/;

export function parseSearchQuery(query: string): ParsedQuery {
  const text = query.trim().toLowerCase().replace(/\s+/g, ' ');
  const compact = text.replace(/[\s-]/g, '');
  const m = CODE_RE.exec(compact);
  // A bare number needs three digits; "21" alone is too vague to be a code.
  const code =
    m && (m[1] || m[2].length >= 3) ? { dept: m[1] ?? '', number: m[2] } : null;
  return { text, words: text ? text.split(' ') : [], code };
}

interface CourseText {
  /** Everything searchable about the course, lowercased, space-joined. */
  haystack: string;
  /** Its distinct words, for typo matching. */
  tokens: string[];
  name: string;
  nameTokens: string[];
  departmentTokens: string[];
  tagText: string;
  description: string;
  /** "ma1022", then each cross-listed code the same way. */
  codes: string[];
}

const TOKEN_SPLIT = /[^a-z0-9+#]+/;
const tokenize = (text: string) => text.split(TOKEN_SPLIT).filter(Boolean);

// Built once per Course. Catalog Course objects are never mutated (a data
// refresh builds new ones), so entries cannot go stale.
const textCache = new WeakMap<Course, CourseText>();

function courseText(course: Course): CourseText {
  let text = textCache.get(course);
  if (text) return text;

  const code = `${course.departmentAbbr}${course.number}`.toLowerCase();
  const codes = [
    code,
    ...course.crossListedWith.map(c => c.toLowerCase().replace(/[\s-]/g, '')),
  ];
  const name = course.name.toLowerCase();
  const description = course.description.toLowerCase();
  const department =
    `${course.departmentAbbr} ${course.departmentName}`.toLowerCase();
  const tagText = [...course.degreeAttributes, ...course.courseTypes]
    .join(' ')
    .toLowerCase();
  const haystack = [
    `${course.departmentAbbr} ${course.number}`.toLowerCase(),
    ...codes,
    ...course.crossListedWith.map(c => c.toLowerCase()),
    name,
    description,
    department,
    tagText,
  ].join(' ');

  text = {
    haystack,
    tokens: [...new Set(tokenize(haystack))],
    name,
    nameTokens: tokenize(name),
    departmentTokens: tokenize(department),
    tagText,
    description,
    codes,
  };
  textCache.set(course, text);
  return text;
}

/** How many edits a word may be off by and still match: 0 below 5 letters. */
function typoAllowance(word: string): number {
  if (word.length >= 9) return 2;
  if (word.length >= 5) return 1;
  return 0;
}

/** `word` is within its typo allowance of the start of `token`. */
function nearPrefix(word: string, token: string): boolean {
  const limit = typoAllowance(word);
  if (limit === 0 || token.length < word.length - limit) return false;
  return editDistance(word, token, limit, true) <= limit;
}

function codeMatches(course: Course, code: { dept: string; number: string }) {
  const { codes } = courseText(course);
  if (code.dept) return codes.some(c => c.startsWith(code.dept + code.number));
  return course.number.toLowerCase().startsWith(code.number);
}

/** The description names the code, as prerequisites do ("MA 1022"). */
function mentionsCode(course: Course, code: { dept: string; number: string }) {
  if (!code.dept) return false;
  return new RegExp(`\\b${code.dept}\\s*-?${code.number}\\b`).test(
    courseText(course).description,
  );
}

/**
 * Whether the course's own text matches the query; for a word query, the
 * words it matches. Section text (instructors, rooms) is checked separately
 * by SearchTextFilter, since it differs per section.
 */
export function matchCourseText(
  course: Course,
  query: ParsedQuery,
): { all: boolean; matched: boolean[] } {
  if (query.code) {
    const ok =
      codeMatches(course, query.code) || mentionsCode(course, query.code);
    return { all: ok, matched: [ok] };
  }
  const text = courseText(course);
  const matched = query.words.map(
    word =>
      text.haystack.includes(word) ||
      text.tokens.some(t => nearPrefix(word, t)),
  );
  return { all: matched.every(Boolean), matched };
}

/**
 * Ranks courses by relevance to a search query, best first. Sorts in place,
 * as callers expect the same array back.
 */
export function rankCoursesByRelevance(
  courses: Course[],
  query: string,
): Course[] {
  if (!query.trim()) return courses;

  // Score each course once rather than on every comparison.
  const scores = new Map<Course, number>();
  for (const course of courses) {
    scores.set(course, calculateRelevanceScore(course, query));
  }
  return courses.sort((a, b) => scores.get(b)! - scores.get(a)!);
}

/** The numeric part's first digit: 1-4 undergraduate, 5 and up graduate. */
export function courseLevel(course: Course): number | null {
  const digits = /\d+/.exec(course.number)?.[0];
  return digits ? Number(digits[0]) : null;
}

/**
 * Relevance of a course to a query, higher is better, 0 for no match on
 * the course's own text. Tiers, strongest first: the course code, the whole
 * query in the name, each word in the name, then the department, degree
 * attributes and course types, and last the description. A course matched
 * only through an instructor or room scores just its tie-breaks.
 */
export function calculateRelevanceScore(course: Course, query: string): number {
  const parsed = parseSearchQuery(query);
  if (!parsed.text) return 0;
  const text = courseText(course);
  let score = 0;

  if (parsed.code) {
    const { dept, number } = parsed.code;
    const [own, ...crossListed] = text.codes;
    const want = dept + number;
    // Above anything a word query can reach.
    if (dept) {
      if (own === want) score += 3000;
      else if (own.startsWith(want)) score += 2000;
      else if (crossListed.includes(want)) score += 2500;
      else if (crossListed.some(c => c.startsWith(want))) score += 1800;
    } else if (course.number.toLowerCase() === number) score += 2400;
    else if (course.number.toLowerCase().startsWith(number)) score += 1600;
    if (mentionsCode(course, parsed.code)) score += 5;
  } else {
    // The whole query against the name.
    if (text.name === parsed.text) score += 850;
    if (text.name.startsWith(parsed.text)) score += 600;
    if (text.name.includes(parsed.text)) score += 400;

    // Each word: its best showing in the name, plus the lesser fields.
    let wordsInName = 0;
    for (const word of parsed.words) {
      let name = 0;
      if (text.nameTokens.includes(word)) name = 120;
      else if (text.nameTokens.some(t => t.startsWith(word))) name = 90;
      else if (text.name.includes(word)) name = 60;
      else if (text.nameTokens.some(t => nearPrefix(word, t))) name = 50;
      if (name > 0) wordsInName++;

      let department = 0;
      if (text.departmentTokens.includes(word)) department = 60;
      else if (text.departmentTokens.some(t => t.startsWith(word)))
        department = 40;

      const tags = text.tagText.includes(word) ? 30 : 0;

      let description = 0;
      if (new RegExp(`\\b${escapeRegExp(word)}`).test(text.description))
        description = 8;
      else if (text.description.includes(word)) description = 3;

      score += name + department + tags + description;
    }
    if (parsed.words.length > 1 && wordsInName === parsed.words.length) {
      score += 150;
    }
    if (score === 0 && matchCourseText(course, parsed).all) score = 1;
  }

  if (score === 0) return 0;

  // Tie-breaks worth about a point together: open seats, lower-level
  // (introductory) courses, then shorter names, so "Calculus I" leads
  // "Calculus I With Preliminary Review".
  const sections = getAllSections(course);
  if (sections.some(s => s.seatsAvailable > 0)) score += 0.5;
  const level = courseLevel(course);
  if (level !== null) score += (9 - Math.min(level, 9)) * 0.05;
  score += 0.2 / (1 + text.name.length / 20);
  return score;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Unique professor names across all course sections, sorted; TBA entries excluded.
 */
export function getAvailableProfessors(courses: Course[]): string[] {
  const professors = new Set<string>();

  courses.forEach(course => {
    const sections = getAllSections(course);
    sections.forEach(section => {
      section.periods.forEach(period => {
        if (period.professor && period.professor !== 'TBA') {
          professors.add(period.professor);
        }
      });
    });
  });

  return Array.from(professors).sort();
}
