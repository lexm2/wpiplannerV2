import { Course } from '../types/types';
import { getAllSections } from './courseUtils';
import { editDistance } from './editDistance';

/**
 * Text search over courses, shared by SearchTextFilter (what matches) and
 * the relevance ranking (in what order), so the two always agree.
 *
 * A query is either a course code, matched by prefix ("MA 1022", "ma1022",
 * "MA_1022", "CS 21" for every CS 21xx, "CS2" for every CS 2xxx of a
 * department the catalog has, or a bare number "1022") and
 * optionally followed by words that must match too ("MA 1022 calculus"),
 * or words. Roman numerals I-IV and digits 1-4 are the same word. Every word
 * must match somewhere in the course (its code, name, description,
 * department, degree attributes, course types or cross-listed codes) or in
 * the section (instructor, room, section number): "game design" needs both
 * words. A word of five letters or more also matches with one typo ("robtics",
 * "robotcs"), and nine or more with two. A word of three letters or fewer
 * matches only a whole word (or its plural), so "AI" finds "AI in Writing"
 * but not "Aircraft"; it also matches the initials of consecutive words of
 * the name ("AI": "Artificial Intelligence", "CAD": "Computer Aided Design").
 * Accents are ignored on both sides: "Neel" finds "Néel", "Martín" "Martin".
 */

export interface ParsedQuery {
  /** Lowercased and trimmed, inner whitespace collapsed. */
  text: string;
  /**
   * Its words, split as course text is and with Roman numerals read as
   * digits ("calculus i" and "calculus 1" are the same words). For a code
   * query, the words after the code ("MA 1022 calculus": ["calculus"]).
   */
  words: string[];
  /** Set when the query reads as a course code or number, alone or first. */
  code: { dept: string; number: string } | null;
  /**
   * Distinct words past the first MAX_QUERY_WORDS, left out of the search;
   * absent when none were.
   */
  ignored?: string[];
}

/**
 * Distinct words a query is searched by; any more are ignored. Matching
 * costs a pass over the catalog per word, and no course is about a dozen
 * different things.
 */
export const MAX_QUERY_WORDS = 12;

// "ma1022", "cs21", "cs2", "ds502", "1022"; 2-5 letter departments (IMGD,
// BCB...).
const CODE_RE = /^([a-z]{2,5})?(\d{1,4}[a-z]?)$/;
// A code followed by words: "ma 1022 calculus", "cs-2102 java".
const LEADING_CODE_RE = /^([a-z]{2,5})[\s_.-]*(\d{1,4}[a-z]?)\s+(.+)$/;

/**
 * What search learns from the course text it reads, held by one SearchIndex
 * per catalog: a catalog that replaces another gets a new index, so nothing
 * the old courses taught carries over, and nothing changes under a search
 * still reading the old catalog.
 */
interface Vocabulary {
  /**
   * Department codes the catalog has, lowercased. A single digit makes a
   * code only after one of these: "CS 2" is every CS 2xxx, while "calc 2"
   * is two words.
   */
  knownDepartments: Set<string>;
  /**
   * Acronyms the catalog itself defines, "artificial intelligence (AI)":
   * the acronym, lowercased, to the words it stands for.
   */
  definedAcronyms: Map<string, Set<string>>;
  /**
   * Each course name, numbering aside, to the codes offering it: "operating
   * systems" to CS3013 and CS502.
   */
  subjectCodes: Map<string, Set<string>>;
  /**
   * Every token of every course text built, so a query word's typo matches
   * are worked out once per distinct token (nearTokens) rather than once
   * per token of every course.
   */
  tokens: Set<string>;
  /**
   * Query words to the vocabulary tokens each is a typo of (nearPrefix),
   * kept up to date as the vocabulary grows. Forgotten past a few dozen
   * words, as a session of searches would otherwise pile them up.
   */
  nearCache: Map<string, Set<string>>;
  /**
   * Each course's text, built once. Catalog Course objects are never
   * mutated (a data refresh builds new ones), so entries cannot go stale.
   */
  texts: WeakMap<Course, CourseText>;
}

/**
 * I-IV as course names number their sequels. A Map, not an object literal:
 * the keys are user text, and "constructor" must not find Object's.
 */
const NUMERALS = new Map([
  ['i', '1'],
  ['ii', '2'],
  ['iii', '3'],
  ['iv', '4'],
]);
const numeral = (token: string) => NUMERALS.get(token) ?? token;

/**
 * Short forms no prefix or typo rule reads right: "stats" is no prefix of
 * "statistics", and one typo away from "static" and "statements". Mapped to
 * the shared start of "statistics" and "statistical".
 */
const SHORT_FORMS = new Map([
  ['stat', 'statistic'],
  ['stats', 'statistic'],
]);

/** Accents as combining marks, once a string is decomposed (NFD). */
const MARKS = /\p{M}+/gu;

/** The text without its accents: "Néel" to "Neel". Case is kept. */
const stripMarks = (text: string) =>
  // Plain ASCII, nearly all of the catalog, skips the normalization.
  /[^\p{ASCII}]/u.test(text) ? text.normalize('NFD').replace(MARKS, '') : text;

/**
 * Text as search compares it: lowercased and without accents, so "Néel",
 * "NEEL" and "neel" are one word. Course text, section text and queries all
 * pass through it; so should anything else matched against them.
 */
export const foldText = (text: string) => stripMarks(text.toLowerCase());

const TOKEN_SPLIT = /[^a-z0-9+#]+/;
const tokenize = (text: string) => text.split(TOKEN_SPLIT).filter(Boolean);

/**
 * The code a compact query spells, read the same way however it is written:
 * "MA 1022", "MA-1022", "MA_1022", "ma1022", and "ma1o22" with a letter O
 * typed for a zero.
 */
function readCode(vocab: Vocabulary, compact: string): ParsedQuery['code'] {
  const fixed = compact.replace(
    /^([a-z]{2,5})?([\do]+)([a-z]?)$/,
    (whole, dept: string | undefined, digits: string, tail: string) =>
      /\d/.test(digits)
        ? `${dept ?? ''}${digits.replace(/o/g, '0')}${tail}`
        : whole,
  );
  const m = CODE_RE.exec(fixed);
  if (!m) return null;
  const [, dept, number] = m;
  const digits = number.replace(/\D/g, '').length;
  // A bare number needs three digits; "21" alone is too vague to be a code.
  if (!dept) return digits >= 3 ? { dept: '', number } : null;
  if (digits === 1 && !vocab.knownDepartments.has(dept)) return null;
  return { dept, number };
}

/** The query's distinct words, in order, split from the cap's leftovers. */
function queryWords(text: string): Pick<ParsedQuery, 'words' | 'ignored'> {
  const distinct = [
    ...new Set(tokenize(text).map(t => SHORT_FORMS.get(t) ?? numeral(t))),
  ];
  if (distinct.length <= MAX_QUERY_WORDS) return { words: distinct };
  return {
    words: distinct.slice(0, MAX_QUERY_WORDS),
    ignored: distinct.slice(MAX_QUERY_WORDS),
  };
}

/**
 * A department name as words, "and" left out, since the catalog writes
 * "Interactive Media & Game Development" and students "... and Game ...".
 */
const departmentPhrase = (words: string[]) =>
  words.filter(w => w !== 'and').join(' ');

/** The query names the course's department, in full or by abbreviation. */
const namesDepartment = (text: CourseText, words: string[]) =>
  words.length > 0 && text.departmentNames.includes(departmentPhrase(words));

function parseQuery(vocab: Vocabulary, query: string): ParsedQuery {
  const text = foldText(query).trim().replace(/\s+/g, ' ');
  const code = readCode(vocab, text.replace(/[\s_.-]/g, ''));
  if (code) return { text, words: [], code };
  const lead = LEADING_CODE_RE.exec(text);
  const leadCode = lead ? readCode(vocab, lead[1] + lead[2]) : null;
  if (lead && leadCode) {
    return { text, ...queryWords(lead[3]), code: leadCode };
  }
  return { text, ...queryWords(text), code: null };
}

/** Words this short match only whole words, never inside one. */
const SHORT_WORD = 3;
const isShort = (word: string) => word.length <= SHORT_WORD;

/** A short word, or its plural, as a token: "art" matches "arts". */
const shortWordIs = (word: string, token: string) =>
  token === word || token === `${word}s` || token === `${word}es`;

/**
 * `word` appears in `text`: anywhere for a longer word, as a whole token for
 * a short one, so "ai" is not found in "aircraft".
 */
function wordIn(word: string, text: string, tokens: string[]): boolean {
  return isShort(word)
    ? tokens.some(t => shortWordIs(word, t))
    : text.includes(word);
}

// Not part of an acronym: "Art and Industry" does not spell "AI".
const ACRONYM_STOP = new Set(['and', 'the', 'for', 'with', 'from', 'into']);

const DEFINITION_RE = /((?:[A-Za-z]+[ -]){1,4}[A-Za-z]+)\s*\(([A-Z]{2,4})\)/g;

function learnAcronyms(vocab: Vocabulary, raw: string): void {
  const { definedAcronyms } = vocab;
  for (const [, phrase, acronym] of raw.matchAll(DEFINITION_RE)) {
    const words = phrase.toLowerCase().split(/[ -]/).slice(-acronym.length);
    if (words.map(w => w[0]).join('') !== acronym.toLowerCase()) continue;
    const key = acronym.toLowerCase();
    if (!definedAcronyms.has(key)) definedAcronyms.set(key, new Set());
    definedAcronyms.get(key)!.add(words.join(' '));
  }
}

/**
 * A name's words read as a defined expansion: the same words, or for three
 * or more all but one ("computer aided design" for CAD defined as
 * "computer aided drawing").
 */
function sameExpansion(run: string[], expansion: string): boolean {
  const words = expansion.split(' ');
  const same = run.filter((t, i) => t === words[i]).length;
  return same === run.length || (run.length >= 3 && same >= run.length - 1);
}

/**
 * A 2-4 letter word spelled by the initials of consecutive name words:
 * "ai" in "Introduction To Artificial Intelligence". Initials alone spell
 * too much ("Accelerated Introduction"), so the words must be what the
 * catalog defines the acronym as somewhere, or the course's own text must
 * use the acronym, or they must be the whole name, numbering aside, of a
 * subject the catalog offers under two codes or more ("os": CS 3013 and
 * CS 502 "Operating Systems"; "dl": "Deep Learning" four times over). A
 * one-off name is too often a chance spelling ("pe": "Project
 * Evaluation"), where a subject taught at both levels is a field with a
 * name of its own.
 */
function acronymIn(vocab: Vocabulary, word: string, text: CourseText): boolean {
  return acronymStart(vocab, word, text) !== -1;
}

/** A name's words without the number ending a sequel's: "deep learning". */
function subjectOf(nameTokens: string[]): string[] {
  let end = nameTokens.length;
  while (end > 0 && /^\d+$/.test(nameTokens[end - 1])) end--;
  return nameTokens.slice(0, end);
}

function learnSubject(
  vocab: Vocabulary,
  nameTokens: string[],
  code: string,
): void {
  const { subjectCodes } = vocab;
  const subject = subjectOf(nameTokens).join(' ');
  if (!subjectCodes.has(subject)) subjectCodes.set(subject, new Set());
  subjectCodes.get(subject)!.add(code);
}

/** Where in the name the words `word` stands for start; -1 when they don't. */
function acronymStart(
  vocab: Vocabulary,
  word: string,
  text: CourseText,
): number {
  if (word.length < 2 || word.length > 4 || !/^[a-z]+$/.test(word)) {
    return -1;
  }
  const defined = vocab.definedAcronyms.get(word);
  const usedHere = text.descriptionTokens.includes(word);
  const tokens = text.nameTokens;
  const spells = (run: string[]) =>
    run.length === word.length &&
    run.every(t => t.length >= 3 && !ACRONYM_STOP.has(t)) &&
    run.map(t => t[0]).join('') === word;
  if (!defined && !usedHere) {
    const subject = subjectOf(tokens);
    const codes = vocab.subjectCodes.get(subject.join(' '))?.size ?? 0;
    return codes >= 2 && spells(subject) ? 0 : -1;
  }
  return tokens.findIndex((_, i) => {
    const run = tokens.slice(i, i + word.length);
    if (!spells(run)) return false;
    return usedHere || [...defined!].some(e => sameExpansion(run, e));
  });
}

interface CourseText {
  /** Everything searchable about the course, lowercased, space-joined. */
  haystack: string;
  /** Its distinct words, numerals also as digits, for whole-word matching. */
  tokens: string[];
  name: string;
  /** The name's words, Roman numerals as digits. */
  nameTokens: string[];
  /** "computer science" and "cs", for a query naming the department. */
  departmentNames: string[];
  departmentTokens: string[];
  tagText: string;
  tagTokens: string[];
  description: string;
  descriptionTokens: string[];
  /** "ma1022", then each cross-listed code the same way. */
  codes: string[];
}

/**
 * Filtered copies of catalog courses to the course each copies. A copy
 * differs only in its sections, and course text reads none of them, so it
 * shares the original's text.
 */
const originals = new WeakMap<Course, Course>();

/**
 * Records `copy` as `original` with some of its sections left out (see
 * SectionFilterPipeline.reconstructCourses), so search reads the text it
 * already built for the original rather than building it again.
 */
export function noteCourseCopy(copy: Course, original: Course): void {
  originals.set(copy, originals.get(original) ?? original);
}

/** The course's text, built and learned from on first read. */
function courseText(vocab: Vocabulary, given: Course): CourseText {
  const course = originals.get(given) ?? given;
  let text = vocab.texts.get(course);
  if (text) return text;

  const code = foldText(`${course.departmentAbbr}${course.number}`);
  const codes = [
    code,
    ...course.crossListedWith.map(c => foldText(c).replace(/[\s-]/g, '')),
  ];
  const name = foldText(course.name);
  const description = foldText(course.description);
  const department = foldText(
    `${course.departmentAbbr} ${course.departmentName}`,
  );
  const tagText = foldText(
    [...course.degreeAttributes, ...course.courseTypes].join(' '),
  );
  const haystack = [
    foldText(`${course.departmentAbbr} ${course.number}`),
    ...codes,
    ...course.crossListedWith.map(foldText),
    name,
    description,
    department,
    tagText,
  ].join(' ');

  learnAcronyms(vocab, stripMarks(`${course.name} ${course.description}`));
  for (const c of codes) {
    vocab.knownDepartments.add(c.replace(/[^a-z].*$/, ''));
  }
  const nameTokens = tokenize(name).map(numeral);
  learnSubject(vocab, nameTokens, code);
  const tokens = tokenize(haystack);
  const distinct = [...new Set([...tokens, ...tokens.map(numeral)])];
  learnTokens(vocab, distinct);
  text = {
    haystack,
    tokens: distinct,
    name,
    nameTokens,
    departmentNames: [
      departmentPhrase(tokenize(foldText(course.departmentName))),
      foldText(course.departmentAbbr),
    ],
    departmentTokens: tokenize(department),
    tagText,
    tagTokens: tokenize(tagText),
    description,
    descriptionTokens: tokenize(description),
    codes,
  };
  vocab.texts.set(course, text);
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

const NEAR_CACHE_WORDS = 32;

function learnTokens(vocab: Vocabulary, tokens: string[]): void {
  for (const token of tokens) {
    if (vocab.tokens.has(token)) continue;
    vocab.tokens.add(token);
    for (const [word, near] of vocab.nearCache) {
      if (nearPrefix(word, token)) near.add(token);
    }
  }
}

/** The tokens of any course text that `word` is a typo of. */
function nearTokens(vocab: Vocabulary, word: string): Set<string> {
  const { nearCache } = vocab;
  let near = nearCache.get(word);
  if (near) return near;
  if (nearCache.size >= NEAR_CACHE_WORDS) nearCache.clear();
  near = new Set();
  for (const token of vocab.tokens) {
    if (nearPrefix(word, token)) near.add(token);
  }
  nearCache.set(word, near);
  return near;
}

/** Some token is one `word` is a typo of; nearPrefix over each, but faster. */
function hasNearToken(
  vocab: Vocabulary,
  word: string,
  tokens: string[],
): boolean {
  if (typoAllowance(word) === 0) return false;
  const near = nearTokens(vocab, word);
  return near.size > 0 && tokens.some(t => near.has(t));
}

/** Endings a word may drop and still be the same word, for shortenedTo. */
const ENDINGS = new Set(['s', 'es', 'ed', 'er', 'ers', 'al', 'ion', 'ions']);
const ING = /^(?:[a-z])?ing$/;

/**
 * `token` is `word` without a common ending, and five letters or more:
 * "program" for "programming", "network" for "networking", "material" for
 * "materials". Not "robot" for "robotcs", a typo of "robotics". Only name
 * words are read this way; descriptions say "program" of degree programs
 * too often.
 */
function shortenedTo(word: string, token: string): boolean {
  if (token.length < 5 || !word.startsWith(token)) return false;
  const ending = word.slice(token.length);
  return ENDINGS.has(ending) || ING.test(ending);
}

/** How a word matches one name word, best first; null when it doesn't. */
type NameHit = 'exact' | 'prefix' | 'typo';

function nameHit(word: string, token: string): NameHit | null {
  if (isShort(word)) return shortWordIs(word, token) ? 'exact' : null;
  if (token === word) return 'exact';
  if (token.startsWith(word) || shortenedTo(word, token)) return 'prefix';
  return nearPrefix(word, token) ? 'typo' : null;
}

type Code = NonNullable<ParsedQuery['code']>;

function codeMatches(course: Course, text: CourseText, code: Code) {
  if (code.dept) {
    return text.codes.some(c => c.startsWith(code.dept + code.number));
  }
  return course.number.toLowerCase().startsWith(code.number);
}

/** The description names the code, as prerequisites do ("MA 1022"). */
function mentionsCode(text: CourseText, code: Code) {
  if (!code.dept) return false;
  return new RegExp(`\\b${code.dept}\\s*-?${code.number}\\b`).test(
    text.description,
  );
}

/** One word against the course's own text: anywhere, typo or acronym. */
function wordMatches(
  vocab: Vocabulary,
  text: CourseText,
  word: string,
): boolean {
  return (
    wordIn(word, text.haystack, text.tokens) ||
    hasNearToken(vocab, word, text.tokens) ||
    text.nameTokens.some(t => shortenedTo(word, t)) ||
    acronymIn(vocab, word, text)
  );
}

/**
 * The course's own text against the query: `all` when it matches, and
 * `word(i)` for whether it matches the query's i-th word, each worked out
 * once and only when asked. Section text (instructors, rooms) is checked
 * separately by SearchTextFilter, since it differs per section. A code query
 * with words after the code needs both.
 */
export interface CourseWordMatch {
  all: boolean;
  word: (index: number) => boolean;
}

function matchWords(
  vocab: Vocabulary,
  course: Course,
  query: ParsedQuery,
): CourseWordMatch {
  const text = courseText(vocab, course);
  if (query.code) {
    const ok =
      (codeMatches(course, text, query.code) ||
        mentionsCode(text, query.code)) &&
      query.words.every(word => wordMatches(vocab, text, word));
    return { all: ok, word: () => ok };
  }
  if (namesDepartment(text, query.words)) {
    return { all: true, word: () => true };
  }
  const known: boolean[] = [];
  const word = (i: number) =>
    (known[i] ??= wordMatches(vocab, text, query.words[i]));
  // Stops at the first word the course lacks: most of the catalog lacks the
  // first word of any query, and the rest need not be looked at.
  return { all: query.words.every((_, i) => word(i)), word };
}

/** A free text folded (foldText) and split into words, once for many words. */
export interface FoldedText {
  text: string;
  tokens: string[];
}

export function foldWords(text: string): FoldedText {
  const folded = foldText(text);
  return { text: folded, tokens: tokenize(folded) };
}

const asFolded = (text: string | FoldedText) =>
  typeof text === 'string' ? foldWords(text) : text;

/**
 * Whether `word` (a query word, already folded) occurs in a free text such
 * as a section's instructors and rooms, by the same rule as course text:
 * whole words only when short. The text is folded here if it is not yet.
 */
export function textHasWord(text: string | FoldedText, word: string): boolean {
  const folded = asFolded(text);
  return wordIn(word, folded.text, folded.tokens);
}

/**
 * Whether `word` occurs in instructor names: a short word as the start of a
 * name ("Li" finds Li and Lin, not Elizabeth), a longer one anywhere.
 * Accents aside: "Neel" finds "EJ Néel".
 */
export function namesHaveWord(
  names: string | FoldedText,
  word: string,
): boolean {
  const folded = asFolded(names);
  return isShort(word)
    ? folded.tokens.some(t => t.startsWith(word))
    : folded.text.includes(word);
}

/** `word` matches description token `token`, as matchCourseWords reads it. */
function tokenMatches(word: string, token: string): boolean {
  if (isShort(word)) return shortWordIs(word, token);
  return token.includes(word) || nearPrefix(word, token);
}

/** Tokens a match may stretch over and still count as one phrase. */
const NEAR_SPAN = 6;

/**
 * The fewest description tokens spanning one match of every word, or null
 * when some word is not there: 2 for "procedural generation" written as a
 * phrase.
 */
function descriptionSpan(text: CourseText, words: string[]): number | null {
  const positions = words.map(word =>
    text.descriptionTokens.flatMap((t, i) =>
      tokenMatches(word, t) ? [i] : [],
    ),
  );
  if (positions.some(p => p.length === 0)) return null;
  let best = Infinity;
  // Anchor on each match of the first word; nearest match of each other.
  for (const anchor of positions[0]) {
    let lo = anchor;
    let hi = anchor;
    for (const ps of positions.slice(1)) {
      const nearest = ps.reduce((a, b) =>
        Math.abs(b - anchor) < Math.abs(a - anchor) ? b : a,
      );
      lo = Math.min(lo, nearest);
      hi = Math.max(hi, nearest);
    }
    best = Math.min(best, hi - lo + 1);
  }
  return best;
}

const isNear = (span: number | null, words: number) =>
  span !== null && span <= NEAR_SPAN + words - 2;

/** The word in the name: a whole word, initials, a prefix or a typo. */
function wordInName(
  vocab: Vocabulary,
  text: CourseText,
  word: string,
): boolean {
  return (
    wordIn(word, text.name, text.nameTokens) ||
    text.nameTokens.some(t => nameHit(word, t) !== null) ||
    acronymIn(vocab, word, text)
  );
}

/**
 * Where the words run through the name in order, one name word each: the
 * index of the first, and whether any was a typo. Each word may be the
 * whole name word, its start, a shorter form or a typo of it, so "intro to
 * programming" runs through "Introduction To Program Design" and "machine
 * lerning" through "Machine Learning". Null when the words are not there
 * together.
 */
function phraseInName(
  text: CourseText,
  words: string[],
): { at: number; typo: boolean } | null {
  const tokens = text.nameTokens;
  for (let at = 0; at + words.length <= tokens.length; at++) {
    let typo = false;
    const runs = words.every((word, k) => {
      const hit = nameHit(word, tokens[at + k]);
      if (hit === 'typo') typo = true;
      return hit !== null;
    });
    if (runs) return { at, typo };
  }
  return null;
}

/**
 * How a course matched a query, for telling a strong match from a weak one:
 * - code: its own or a cross-listed code is the one asked for;
 * - mentions: only its description names the code ("MA 1022" in a
 *   prerequisite);
 * - title: every word is in the name, code, department or degree tags;
 * - description: some word only in the description, the words together
 *   (within a few words of each other);
 * - scattered: some word only in the description, the words far apart;
 * - sectionTitle: a section's own title supplied the missing words
 *   ("B01 - ST: AI and Economics" under ECON 2800 Special Topics);
 * - section: an instructor or room matched.
 */
export type SearchMatch =
  | 'code'
  | 'mentions'
  | 'title'
  | 'description'
  | 'scattered'
  | 'sectionTitle'
  | 'section';

/** The titles some sections carry after their number: "ST: AI and Economics". */
function sectionTitles(course: Course): string {
  return getAllSections(course)
    .map(s => foldText(s.number.split(' - ').slice(1).join(' - ')))
    .join(' ');
}

function describe(
  vocab: Vocabulary,
  course: Course,
  query: string,
): SearchMatch {
  const parsed = parseQuery(vocab, query);
  const text = courseText(vocab, course);
  if (parsed.code) {
    return codeMatches(course, text, parsed.code) ? 'code' : 'mentions';
  }
  if (namesDepartment(text, parsed.words)) return 'title';
  const { all, word } = matchWords(vocab, course, parsed);
  if (!all) {
    const titles = foldWords(sectionTitles(course));
    const fromTitles = parsed.words.every(
      (w, i) => word(i) || textHasWord(titles, w),
    );
    return fromTitles ? 'sectionTitle' : 'section';
  }
  const inTitle = (word: string) =>
    wordInName(vocab, text, word) ||
    text.codes.some(c => c.startsWith(word)) ||
    wordIn(word, text.departmentTokens.join(' '), text.departmentTokens) ||
    text.departmentTokens.some(t => nearPrefix(word, t)) ||
    wordIn(word, text.tagText, text.tagTokens);
  if (parsed.words.every(inTitle)) return 'title';
  if (parsed.words.length === 1) return 'description';
  return isNear(descriptionSpan(text, parsed.words), parsed.words.length)
    ? 'description'
    : 'scattered';
}

/** The numeric part's first digit: 1-4 undergraduate, 5 and up graduate. */
export function courseLevel(course: Course): number | null {
  const digits = /\d+/.exec(course.number)?.[0];
  return digits ? Number(digits[0]) : null;
}

/** The code tier: above anything a word query can reach. */
function codeScore(course: Course, text: CourseText, code: Code) {
  const [own, ...crossListed] = text.codes;
  const want = code.dept + code.number;
  let score = 0;
  if (code.dept) {
    if (own === want) score += 3000;
    else if (own.startsWith(want)) score += 2000;
    else if (crossListed.includes(want)) score += 2500;
    else if (crossListed.some(c => c.startsWith(want))) score += 1800;
  } else if (course.number.toLowerCase() === code.number) score += 2400;
  else if (course.number.toLowerCase().startsWith(code.number)) score += 1600;
  if (mentionsCode(text, code)) score += 5;
  return score;
}

/**
 * The words against the name, department, tags and description. A word's
 * description points count only when the name lacks it, so a description
 * that repeats a title word cannot lift its course over another titled
 * the same ("calculus" in MA 1022's description, not MA 1021's).
 */
function wordScore(
  vocab: Vocabulary,
  text: CourseText,
  words: string[],
): number {
  if (!words.length) return 0;
  let score = 0;
  // The whole query against the name, word for word ("calc" for
  // "calculus", "intro to programming" for "Introduction To Program
  // Design"); a run with a typo in it counts for less.
  const phrase = phraseInName(text, words);
  if (text.nameTokens.join(' ') === words.join(' ')) score += 850;
  else if (
    phrase?.at === 0 &&
    words.length > 1 &&
    words.length === text.nameTokens.length
  ) {
    // The whole name, misspelt or shortened: "machine lerning".
    score += 450;
  }
  if (phrase?.at === 0) score += 20;
  if (phrase) score += phrase.typo ? 300 : 400;
  // An acronym spelled out in the name is the same phrase: "AI" for
  // "Artificial Intelligence" ranks with "AI in Writing", not below it.
  if (!phrase && words.length === 1) {
    const at = acronymStart(vocab, words[0], text);
    if (at === 0) score += 20;
    if (at !== -1) score += 400;
  }

  let wordsInName = 0;
  for (const word of words) {
    const short = isShort(word);
    let inName = 0;
    // An acronym the name spells out counts as the word itself.
    if (text.nameTokens.includes(word) || acronymIn(vocab, word, text)) {
      inName = 120;
    } else if (short && text.nameTokens.some(t => shortWordIs(word, t)))
      inName = 100;
    else if (!short && text.nameTokens.some(t => t.startsWith(word)))
      inName = 90;
    else if (!short && text.nameTokens.some(t => shortenedTo(word, t)))
      inName = 80;
    else if (!short && text.name.includes(word)) inName = 60;
    else if (text.nameTokens.some(t => nearPrefix(word, t))) inName = 50;
    if (inName > 0) wordsInName++;

    let department = 0;
    if (text.departmentTokens.includes(word)) department = 60;
    else if (!short && text.departmentTokens.some(t => t.startsWith(word)))
      department = 40;
    // Misspelt as names are: "acounting" for ACC, Accounting.
    else if (text.departmentTokens.some(t => nearPrefix(word, t)))
      department = 20;

    const tags = wordIn(word, text.tagText, text.tagTokens) ? 30 : 0;

    let description = 0;
    if (inName === 0) {
      const bounded = new RegExp(
        `\\b${escapeRegExp(word)}${short ? '(?:e?s)?\\b' : ''}`,
      );
      if (bounded.test(text.description)) description = 8;
      else if (!short && text.description.includes(word)) description = 3;
    }

    score += inName + department + tags + description;
  }
  if (words.length > 1 && wordsInName === words.length) score += 150;
  // Words written together in the description read as its topic.
  if (words.length > 1 && wordsInName < words.length) {
    const span = descriptionSpan(text, words);
    if (span === words.length) score += 25;
    else if (isNear(span, words.length)) score += 12;
  }
  return score;
}

/**
 * Among courses matching a word query alike, the ones a student can most
 * likely take first: lower levels (10 a level), undergraduate over
 * graduate (30), and one with an open seat over a full one (25, more than
 * the name starting with the words). Together less than a word's showing
 * in the name, so they reorder equals and never lift a weaker match. The
 * filtered course holds only the matching sections, so the seats are
 * those of the terms searched.
 */
function likelyFit(course: Course): number {
  let score = 0;
  const level = courseLevel(course);
  if (level !== null) score += (9 - Math.min(level, 9)) * 10;
  if (!course.isGraduate) score += 30;
  if (getAllSections(course).some(s => s.seatsAvailable > 0)) score += 25;
  return score;
}

/** Above any word match, as a department code's prefix ranks. */
const DEPARTMENT_SCORE = 2200;

/** See SearchIndex.score. */
function relevanceScore(
  vocab: Vocabulary,
  course: Course,
  parsed: ParsedQuery,
): number {
  if (!parsed.text) return 0;
  const text = courseText(vocab, course);
  let score: number;

  if (parsed.code) {
    score = codeScore(course, text, parsed.code);
    if (score > 0) score += wordScore(vocab, text, parsed.words);
  } else if (namesDepartment(text, parsed.words)) {
    // Its courses in number order, and nothing else: seats or a short name
    // would scatter the list.
    return DEPARTMENT_SCORE + numberOrder(course);
  } else {
    score = wordScore(vocab, text, parsed.words);
    if (score > 0) score += likelyFit(course);
    if (score === 0 && matchWords(vocab, course, parsed).all) score = 1;
  }

  if (score === 0) return 0;

  // Tie-breaks worth about a point together: open seats, lower-level
  // (introductory) courses, lower numbers within a level, then shorter
  // names, so "Calculus I" leads "Calculus I With Preliminary Review".
  const sections = getAllSections(course);
  if (sections.some(s => s.seatsAvailable > 0)) score += 0.5;
  const level = courseLevel(course);
  if (level !== null) score += (9 - Math.min(level, 9)) * 0.05;
  score += numberOrder(course) * 0.04;
  score += 0.2 / (1 + text.name.length / 20);
  return score;
}

/**
 * Below 1, higher for a lower course number, reading the number as four
 * digits so 588 (a graduate 5xx) sorts after 1101.
 */
function numberOrder(course: Course): number {
  const digits = /\d+/.exec(course.number)?.[0];
  return digits ? 1 - Number(digits.slice(0, 4).padEnd(4, '0')) / 10000 : 0;
}

/**
 * Search over one catalog's courses, holding what it learns from their
 * text: departments, the acronyms the catalog defines, subjects taught
 * under several codes, and every word for typo matching. Each catalog gets
 * its own, built before the catalog is put in use, so a refresh swaps the
 * courses and their vocabulary in one step. Courses the index has not read
 * are read on first use, but reading them all up front (the constructor,
 * add) means acronyms one course defines apply to all of them whatever
 * order they are matched in.
 */
export class SearchIndex {
  private readonly vocab: Vocabulary = {
    knownDepartments: new Set(),
    definedAcronyms: new Map(),
    subjectCodes: new Map(),
    tokens: new Set(),
    nearCache: new Map(),
    texts: new WeakMap(),
  };

  constructor(courses: Iterable<Course> = []) {
    this.add(courses);
  }

  /** Reads courses joining the catalog (the tutorial's); known ones are skipped. */
  add(courses: Iterable<Course>): void {
    for (const course of courses) courseText(this.vocab, course);
  }

  parse(query: string): ParsedQuery {
    return parseQuery(this.vocab, query);
  }

  matchCourseWords(course: Course, query: ParsedQuery): CourseWordMatch {
    return matchWords(this.vocab, course, query);
  }

  describeMatch(course: Course, query: string): SearchMatch {
    return describe(this.vocab, course, query);
  }

  /**
   * Relevance of a course to a query, higher is better, 0 for no match on
   * the course's own text. Tiers, strongest first: the course code (with
   * any words after it ranked within), a query naming the course's
   * department ("computer science", "CS": its courses in number order), the
   * whole query in the name, each word in the name, then the department,
   * degree attributes and course types, and last the description. A course
   * matched only through an instructor or room scores just its tie-breaks.
   */
  score(course: Course, query: string): number {
    return relevanceScore(this.vocab, course, this.parse(query));
  }

  /**
   * Ranks courses by relevance to a search query, best first. Sorts in
   * place, as callers expect the same array back.
   */
  rank(courses: Course[], query: string): Course[] {
    if (!query.trim()) return courses;
    this.add(courses);

    // Score each course once rather than on every comparison, reading the
    // query once for them all.
    const parsed = this.parse(query);
    const scores = new Map<Course, number>();
    for (const course of courses) {
      scores.set(course, relevanceScore(this.vocab, course, parsed));
    }
    return courses.sort((a, b) => scores.get(b)! - scores.get(a)!);
  }

  /**
   * The phrases a query word is read as, by the acronyms the catalog
   * defines: "ai" is "artificial intelligence".
   */
  acronymExpansions(word: string): string[] {
    return [...(this.vocab.definedAcronyms.get(word.toLowerCase()) ?? [])];
  }
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Unique instructor names across all course sections, sorted.
 */
export function getAvailableProfessors(courses: Course[]): string[] {
  const professors = new Set<string>();

  courses.forEach(course => {
    const sections = getAllSections(course);
    sections.forEach(section => {
      section.periods.forEach(period => {
        for (const name of period.instructors) professors.add(name);
      });
    });
  });

  return Array.from(professors).sort();
}
