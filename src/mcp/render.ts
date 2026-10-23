/**
 * The MCP tools' text content: compact, readable renderings of the src/api
 * results for a model to read and quote, never JSON. The same results go
 * out whole as structuredContent.
 */
import type { CourseQueryResult, CourseRow } from '../api/query';
import type {
  CourseDetail,
  CourseSummary,
  SeatTotals,
  InstructorView,
  SectionBrief,
  SectionView,
} from '../api/serialize';
import type { ConflictCheck } from '../api/conflicts';
import type { CoursePlan, catalogMeta } from '../api/lookup';
import type { DateSpan, TermLetter, TermNow } from '../api/calendar';
import { yearLabel } from '../api/calendar';
import { echo } from '../api/errors';
import { one, plural } from '../api/text';
import { escapeRegExp } from '../utils/searchUtils';
import { QUARTERS, TERMS } from '../utils/typeGuards';
import {
  isUncapped,
  LOW_SEATS,
  ownDates,
  SOLID_RATINGS,
} from '../api/serialize';

/** How many matching sections a search row lists before "+N more". */
const MAX_ROW_SECTIONS = 6;

const CATEGORY_TEXT: Record<1 | 2 | 3, string> = {
  1: 'Cat. I (offered every year)',
  2: 'Cat. II (offered at least every other year)',
  3: 'Cat. III (offered occasionally)',
};

function credits(c: CourseSummary): string {
  return c.credits.min === c.credits.max
    ? `${c.credits.max} cr`
    : `${c.credits.min}-${c.credits.max} cr`;
}

/** "2026-09-01" from the refresh timestamp. */
function asOf(dataAsOf: string | null): string {
  return dataAsOf ? dataAsOf.slice(0, 10) : 'an unknown date';
}

const isLow = (available: number) => available > 0 && available <= LOW_SEATS;

interface SeatData {
  dataAsOf: string | null;
  dataAgeDays: number | null;
}

/**
 * Seat counts older than this are a stale copy (a deployed server
 * refreshes every 15 minutes): any count may have moved, not just low ones.
 */
const STALE_DAYS = 7;

/**
 * The once-per-response line on how old the seat counts are: "Seat data is
 * 48 days old (2026-09-01)", with what that means for low or any counts.
 */
function seatDataLine(data: SeatData, low: boolean): string {
  const date = asOf(data.dataAsOf);
  const days = data.dataAgeDays;
  const age =
    days === null
      ? `Seat data is from ${date}`
      : days === 0
        ? `Seat data is under a day old (${date})`
        : `Seat data is ${plural(days, 'day')} old (${date})`;
  if (days !== null && days > STALE_DAYS) {
    return `${age}: check live seats in Workday before registering.`;
  }
  return low
    ? `${age}; low counts (${LOW_SEATS} or fewer) may already be gone.`
    : `${age}.`;
}

type Rating = NonNullable<InstructorView['rmp']>;

/** How many ratings an average rests on, flagged when that is few. */
function ratingCount(n: number): string {
  if (n === 1) return '(1 rating)';
  return n < SOLID_RATINGS ? `(${n}, few ratings)` : `(${n})`;
}

/**
 * "RMP 4.2, diff 2.5 (6)"; with `again`, the share who would take the
 * instructor again too: "RMP 4.2, diff 2.5, 80% again (6)".
 */
function ratingText(r: Omit<Rating, 'url'>, again: boolean): string {
  const parts = [`RMP ${r.rating}`, `diff ${r.difficulty}`];
  if (again && r.wouldTakeAgain !== null) {
    parts.push(`${Math.round(r.wouldTakeAgain)}% again`);
  }
  return `${parts.join(', ')} ${ratingCount(r.numRatings)}`;
}

function instructor(i: InstructorView, again = false): string {
  return i.rmp ? `${i.name} ${ratingText(i.rmp, again)}` : i.name;
}

function seats(s: {
  seats: number;
  seatsAvailable: number;
  overEnrolled?: number;
  waitlist: number;
}): string {
  if (isUncapped(s)) return 'no seat cap';
  // Workday lists some sections Open with a cap of 0 (CP 1001 A101):
  // "FULL 1/0" read as a real section filled.
  const open =
    s.seats === 0
      ? 'capacity 0 listed'
      : s.seatsAvailable > 0
        ? `${s.seatsAvailable}/${s.seats} open`
        : `FULL ${s.seats - s.seatsAvailable + (s.overEnrolled ?? 0)}/${s.seats}`;
  return s.waitlist > 0 ? `${open}, waitlist ${s.waitlist}` : open;
}

/**
 * The once-per-response note for "26/100 open, waitlist 1", which reads
 * as a contradiction but is what Workday reports.
 */
const WAITLIST_NOTE =
  'A waitlist beside open seats is as Workday reports it: students on it may be waiting for a different section or time.';

/**
 * The once-per-response note for sections Workday lists with 999 seats:
 * varsity and club teams, music ensembles. "No seat cap" read as open to
 * anyone.
 */
const MEMBERSHIP_NOTE =
  '"No seat cap" sections (varsity and club teams, ensembles) enroll by team or ensemble membership; the seat count is a placeholder, not open seats.';

const waitlistBesideSeats = (s: { seatsAvailable: number; waitlist: number }) =>
  s.seatsAvailable > 0 && s.waitlist > 0;

/** Status and mode only when they are not the common Open / In-Person. */
function exceptions(s: { status: string; deliveryMode: string }): string[] {
  const parts: string[] = [];
  if (s.status && s.status !== 'Open') parts.push(s.status);
  if (s.deliveryMode && s.deliveryMode !== 'In-Person')
    parts.push(s.deliveryMode);
  return parts;
}

/** "runs 2026-08-20 to 2026-11-06", for a section off its term's dates. */
const runs = (dates: DateSpan | undefined) =>
  dates ? `runs ${dates.start} to ${dates.end}` : '';

function briefLine(s: SectionBrief, withTerm: boolean): string {
  return [
    `${s.number} CRN ${s.crn}${withTerm ? ` ${s.term}` : ''}`,
    runs(s.dates),
    s.meets,
    s.location,
    s.instructors.map(i => instructor(i, true)).join('; '),
    seats(s),
    ...exceptions(s),
  ]
    .filter(Boolean)
    .join(' | ');
}

/**
 * The description, then its prerequisite and background statements on lines
 * of their own, cut from the description so they are not read twice.
 */
const NO_STATEMENT = 'none in a separate field; see the description.';

function describe(c: {
  description: string;
  prerequisites: string | null;
  recommendedBackground: string | null;
}): string[] {
  let description = c.description;
  const cut = (marker: string, statement: string | null) => {
    if (!statement) return;
    description = description.replace(
      new RegExp(`\\s*${marker}\\s*${escapeRegExp(statement)}\\.?`, 'i'),
      ' ',
    );
  };
  cut(
    '(?:the\\s+)?(?:recommended|suggested|required)\\s+backgrounds?(?:\\s+for\\s+this\\s+course)?(?:\\s+(?:is|includes|consists\\s+of))?\\s*[:;]?',
    c.recommendedBackground,
  );
  cut('prerequisites?\\s*[:;]?', c.prerequisites);
  const lines: string[] = [];
  description = description.replace(/\s{2,}/g, ' ').trim();
  if (description) lines.push(`Description: ${description}`);
  // Said either way, so a missing line cannot read as "not shown". Neither
  // says "none": a statement the parser missed may still be in the prose.
  lines.push(
    c.prerequisites
      ? `Prerequisites (as the description states): ${c.prerequisites}`
      : `Prerequisites: ${NO_STATEMENT}`,
  );
  const background = c.recommendedBackground?.replace(/\.$/, '');
  lines.push(
    background
      ? `Recommended background: ${background}.`
      : `Recommended background: ${NO_STATEMENT}`,
  );
  return lines;
}

// --- search_courses ---------------------------------------------------------

function totalSeats(t: SeatTotals): string {
  if (t.uncapped > 0 && t.capacity === 0) return 'no seat cap';
  const capped = seats({
    seats: t.capacity,
    seatsAvailable: t.available,
    waitlist: t.waitlisted,
  });
  return t.uncapped > 0 ? `${capped} + ${t.uncapped} with no seat cap` : capped;
}

/** "101 open in 13 sections", plus any without a seat cap. */
function termTotalsText(t: {
  openSeats: number;
  sections: number;
  uncapped: number;
}): string {
  const parts: string[] = [];
  if (t.sections > 0 || t.uncapped === 0) {
    parts.push(`${t.openSeats} open in ${plural(t.sections, 'section')}`);
  }
  if (t.uncapped > 0) {
    parts.push(
      parts.length
        ? `${t.uncapped} with no seat cap`
        : `${plural(t.uncapped, 'section')} with no seat cap`,
    );
  }
  return parts.join(' + ');
}

/** One total, or per term when the course spans several: "C FULL 90/90 · D 2/66 open". */
function rowSeats(c: CourseRow): string {
  if (c.seatsByTerm.length <= 1) return totalSeats(c.seats);
  return c.seatsByTerm.map(t => `${t.term} ${totalSeats(t)}`).join(' · ');
}

/** Why a weaker match is listed; strong ones need no note. */
function matchNote(
  c: CourseRow,
  search: CourseQueryResult['search'],
): string | null {
  if (!search) return null;
  switch (c.match) {
    case 'mentions':
      return `mentions ${echo(search.query)}`;
    case 'sectionTitle':
      return 'matched a section title';
    case 'section':
      return 'matched an instructor or room';
    case 'description':
      return search.onlyMentions ? null : 'in description only';
    case 'scattered':
      return search.onlyMentions ? null : 'words apart in description';
    default:
      return null;
  }
}

function rowLine(
  c: CourseRow,
  index: number,
  showYear: boolean,
  search: CourseQueryResult['search'],
  easiest: boolean,
): string {
  const parts = [
    `${index}. ${c.code} ${c.name}`,
    credits(c),
    c.terms.length
      ? `${c.terms.join(',')}${c.earlyEntry ? ' (tentative)' : ''}`
      : 'no sections',
    c.earlyEntry && c.year !== null
      ? `${yearLabel(c.year)} early entry: not published, cannot be scheduled yet`
      : rowSeats(c),
  ];
  const note = matchNote(c, search);
  if (note) parts.splice(1, 0, `(${note})`);
  if (c.category) parts.push(`Cat. ${'I'.repeat(c.category)}`);
  if (c.topInstructor) {
    const t = c.topInstructor;
    parts.push(
      `${easiest ? 'easiest rated' : 'top'} ${t.name} ${ratingText(t, false)}`,
    );
  }
  if (c.degreeAttributes.length) parts.push(c.degreeAttributes.join(', '));
  if (c.crossListedWith.length)
    parts.push(`also listed as ${c.crossListedWith.join(', ')}`);
  if (c.isGraduate) parts.push('graduate');
  if (showYear && c.year !== null) parts.push(yearLabel(c.year));
  return parts.join(' | ');
}

type Companion = NonNullable<CourseRow['companions']>[number];

/** Examples a long companion list shows before the count. */
const COMPANION_EXAMPLES = 2;

const companionText = (s: Companion) =>
  `${s.number} CRN ${s.crn}${s.dates ? ` (${runs(s.dates)})` : ''} ${s.meets} (${seats(s)})`;

/** "+ discussion CD01 CRN 1 W 10:00-10:50 (15/60 open)", or a count and examples. */
function companionLine(
  kind: Companion['kind'],
  members: Companion[],
  pairing: string,
): string {
  const noun = kind === 'lab' ? 'lab' : 'discussion';
  if (members.length <= COMPANION_EXAMPLES) {
    return `     + ${one(members.length, noun, `${noun}s`)}${pairing} ${members.map(companionText).join('; ')}`;
  }
  const examples = [
    ...members.filter(m => m.seatsAvailable > 0),
    ...members.filter(m => m.seatsAvailable <= 0),
  ].slice(0, COMPANION_EXAMPLES);
  return `     + ${members.length} ${noun}s${pairing}, e.g. ${examples.map(companionText).join('; ')}`;
}

/**
 * The lines under one lecture of a search row: each kind of lab and
 * discussion on one line. Those of this lecture alone come under it;
 * those several lectures share come once, under the last lecture of the
 * term shown, as "any C lecture" when they go with all of them. A long
 * list is a count with a couple of examples, open ones first.
 */
function companionLines(
  row: CourseRow,
  lecture: SectionBrief,
  shown: SectionBrief[],
): string[] {
  const lines: string[] = [];
  const ofTerm = (row.sections ?? []).filter(l => l.term === lecture.term);
  const lastOfTerm = shown.filter(l => l.term === lecture.term).at(-1);
  for (const kind of ['discussion', 'lab'] as const) {
    const companions = (row.companions ?? []).filter(
      c => c.kind === kind && c.term === lecture.term,
    );
    const own = companions.filter(
      c => c.pairsWith.length === 1 && c.pairsWith[0] === lecture.crn,
    );
    if (own.length) lines.push(companionLine(kind, own, ''));
    const shared = companions.filter(c => c.pairsWith.length > 1);
    if (!shared.length || lastOfTerm?.crn !== lecture.crn) continue;
    const any = shared.every(c =>
      ofTerm.every(l => c.pairsWith.includes(l.crn)),
    );
    lines.push(
      companionLine(
        kind,
        shared,
        any
          ? ` (any ${lecture.term} lecture)`
          : ` (each with some ${lecture.term} lectures; get_course "${row.code}" says which)`,
      ),
    );
  }
  return lines;
}

/** "BME 4023 ran only in A term (ended); includeEndedTerms: true shows it." */
function leftOutLine(l: CourseQueryResult['leftOut'][number]): string {
  const terms = `${l.terms.join(', ')} ${one(l.terms.length, 'term', 'terms')}`;
  const codes = l.codes.join(', ');
  return l.reason === 'endedTerms'
    ? `${codes} ran only in ${terms}, which ${one(l.terms.length, 'has', 'have')} ended; includeEndedTerms: true shows ${one(l.codes.length, 'it', 'them')}.`
    : `${codes} ${one(l.codes.length, 'has', 'have')} only an interest list so far (${terms}: a placeholder to join before sections open); includeInterestLists: true shows ${one(l.codes.length, 'it', 'them')}.`;
}

/** Which filter emptied a search, and what leaving it out would find. */
function relaxationLines(
  relaxations: CourseQueryResult['relaxations'],
  unrestrictive: string[],
): string[] {
  const allowAll = unrestrictive.length
    ? [
        `${unrestrictive.map(f => `filters.${f}`).join(', ')} ${one(unrestrictive.length, 'lets', 'let')} every course through as given, so ${one(unrestrictive.length, 'it is', 'they are')} not to blame.`,
      ]
    : [];
  if (!relaxations.length) return allowAll;
  const helps = relaxations.filter(r => r.total > 0);
  const stuck = relaxations.filter(r => r.total === 0).map(r => r.filter);
  const lines: string[] = [];
  const first = helps[0];
  if (first?.restores.length) {
    lines.push(
      `Most restrictive: filters.${first.filter}; without it, ${first.restores.join(', ')} ${one(first.restores.length, 'is', 'are')} back.`,
    );
  }
  if (helps.length) {
    lines.push(
      `${first.restores.length ? '' : `Most restrictive: filters.${first.filter}. `}Leaving out one filter at a time: ${helps
        .map(
          r =>
            `without ${r.filter}, ${plural(r.total, 'course')}${r.terms.length ? ` (in ${r.terms.join(', ')})` : ''}`,
        )
        .join('; ')}.`,
    );
  } else {
    lines.push(
      'No single filter is to blame: leaving out any one of them still finds nothing; loosen two or more.',
    );
  }
  if (helps.length && stuck.length) {
    lines.push(`Leaving out ${stuck.join(' or ')} alone still finds nothing.`);
  }
  return [...lines, ...allowAll];
}

export function renderSearch(result: CourseQueryResult): string {
  const lines: string[] = [];
  const where = result.year === 'all' ? 'all years' : yearLabel(result.year);
  if (result.total === 0) {
    const leftOut = result.leftOut.map(leftOutLine);
    lines.push(
      ...(leftOut.length ? leftOut : [`No matching courses in ${where}.`]),
    );
    lines.push(...relaxationLines(result.relaxations, result.unrestrictive));
  } else {
    const last = Math.min(result.offset + result.limit, result.total);
    const range =
      result.offset >= result.total
        ? 'none on this page'
        : `${result.offset + 1}-${last}`;
    lines.push(
      `Courses ${range} of ${result.total} in ${where}; seats count only the sections that matched.`,
      ...result.leftOut.map(leftOutLine),
    );
  }
  lines.push(...result.notices);
  if (result.search?.onlyMentions) {
    lines.push(
      'No course is mainly about this; these only mention the words in their descriptions:',
    );
  }
  if (result.courses.some(c => c.sections)) {
    lines.push(
      'Sections: number, CRN, term | meetings | room | instructor | seats; status and mode shown only when not Open / In-Person. "+" lines are the labs and discussions that also passed the filters: take one of each kind with the lecture.',
    );
  }

  result.courses.forEach((c, i) => {
    lines.push(
      rowLine(
        c,
        result.offset + i + 1,
        result.year === 'all',
        result.search,
        result.sort === 'difficulty',
      ),
    );
    if (!c.sections) return;
    const shown = c.sections.slice(0, MAX_ROW_SECTIONS);
    for (const s of shown) {
      lines.push(`   ${briefLine(s, true)}`);
      lines.push(...companionLines(c, s, shown));
    }
    const more = c.sections.length - MAX_ROW_SECTIONS;
    if (more > 0) {
      lines.push(`   +${more} more (get_course "${c.code}")`);
    }
  });

  if (result.offset + result.limit < result.total) {
    lines.push(
      `More: offset ${result.offset + result.limit} for the next page.`,
    );
  }
  if (result.total > 0) {
    const { totals } = result;
    // Seats of different terms cannot be taken together, so never one sum.
    const seatsText =
      totals.byTerm.length >= 2
        ? totals.byTerm.map(t => `${t.term}: ${termTotalsText(t)}`).join(' · ')
        : termTotalsText(totals);
    const which =
      totals.seatsYear === null
        ? ''
        : `; seats in ${yearLabel(totals.seatsYear)} only, the year that can be scheduled`;
    lines.push(
      `All ${plural(totals.courses, 'matching course')}, every page${which}: ${seatsText} (cross-listed sections counted once).`,
    );
  }
  const low = result.courses.some(c =>
    c.sections
      ? c.sections.some(s => isLow(s.seatsAvailable))
      : c.seatsByTerm.some(t => isLow(t.available)),
  );
  const waitlisted = result.courses.some(c =>
    c.sections
      ? c.sections.some(waitlistBesideSeats)
      : c.seatsByTerm.some(t => t.available > 0 && t.waitlisted > 0),
  );
  if (waitlisted) {
    lines.push(WAITLIST_NOTE);
  }
  if (result.courses.some(c => c.seats.uncapped > 0)) {
    lines.push(MEMBERSHIP_NOTE);
  }
  if (result.total > 0) lines.push(seatDataLine(result, low));
  return lines.join('\n');
}

// --- get_course -------------------------------------------------------------

/** A course-detail section as the text shows it: one line's worth. */
interface SectionDigest {
  crn: number;
  number: string;
  term: string;
  kind: SectionView['kind'];
  /** For a lab or discussion: the lecture CRNs it goes with. */
  pairsWith: number[];
  /** "MTRF 10:00-10:50", "Async" or "TBD"; periods joined by "; ". */
  meets: string;
  location: string;
  /** Names; their ratings are listed once, in the digest's `ratings`. */
  instructors: string[];
  seats: number;
  seatsAvailable: number;
  overEnrolled?: number;
  waitlist: number;
  status: string;
  deliveryMode: string;
  meetsWith: string[];
  /** Only when the section starts or ends apart from its term. */
  startDate?: string;
  endDate?: string;
}

/** The section's instructors over all its periods, each once. */
function instructorsOf(s: SectionView): InstructorView[] {
  const people = new Map<string, InstructorView>();
  for (const p of s.periods)
    for (const i of p.instructors) people.set(i.name, i);
  return [...people.values()];
}

function digestSection(
  s: SectionView,
  term: DateSpan | undefined,
): SectionDigest {
  const dates = ownDates(s, term);
  return {
    crn: s.crn,
    number: s.number,
    term: s.term,
    kind: s.kind,
    pairsWith: s.pairsWith,
    meets: s.meets,
    location: s.location,
    instructors: instructorsOf(s).map(i => i.name),
    seats: s.seats,
    seatsAvailable: s.seatsAvailable,
    ...(s.overEnrolled && { overEnrolled: s.overEnrolled }),
    waitlist: s.waitlist,
    status: s.status,
    deliveryMode: s.deliveryMode,
    meetsWith: s.meetsWith,
    ...(dates && { startDate: dates.start, endDate: dates.end }),
  };
}

function viewLine(s: SectionView, term: DateSpan | undefined): string {
  const line = briefLine(
    { ...s, instructors: instructorsOf(s), dates: ownDates(s, term) },
    false,
  );
  return s.meetsWith.length
    ? `${line} | meets with ${s.meetsWith.join(', ')}`
    : line;
}

/**
 * get_course's structuredContent: the same course the text shows, with
 * the same sections (the same terms, interest lists and full sections
 * left out) at the same detail, so the data costs about what the text
 * does. HTTP sends the full CourseDetail.
 */
export function courseDigest(
  d: CourseDetail,
  notices: string[],
  { dataAsOf, dataAgeDays }: SeatData,
  termDates: Partial<Record<TermLetter, DateSpan>> | null,
) {
  return {
    id: d.id,
    code: d.code,
    name: d.name,
    year: d.year,
    credits: d.credits,
    department: d.department,
    departmentName: d.departmentName,
    isGraduate: d.isGraduate,
    category: d.category,
    degreeAttributes: d.degreeAttributes,
    crossListedWith: d.crossListedWith,
    courseTypes: d.courseTypes,
    description: d.description,
    prerequisites: d.prerequisites,
    recommendedBackground: d.recommendedBackground,
    nextYear: d.nextYear,
    earlyEntry: d.earlyEntry,
    omitted: d.omitted,
    ratings: ratingsOf(d.sections),
    dataAsOf,
    dataAgeDays,
    notices,
    // Fields left out at their common value, as the text leaves them out.
    sectionDefaults: SECTION_DEFAULTS,
    sections: d.sections.map(s =>
      withoutDefaults(digestSection(s, termDates?.[s.term as TermLetter])),
    ),
  };
}

/** Rate My Professor numbers per instructor shown, rated ones only. */
function ratingsOf(sections: SectionView[]) {
  const ratings: Record<string, Omit<Rating, 'url'>> = {};
  for (const i of sections.flatMap(instructorsOf)) {
    if (!i.rmp) continue;
    const { rating, difficulty, wouldTakeAgain, numRatings } = i.rmp;
    ratings[i.name] = { rating, difficulty, wouldTakeAgain, numRatings };
  }
  return ratings;
}

const SECTION_DEFAULTS = {
  status: 'Open',
  deliveryMode: 'In-Person',
  waitlist: 0,
  location: '',
  pairsWith: [] as number[],
  meetsWith: [] as string[],
};

function withoutDefaults(s: SectionDigest): Partial<SectionDigest> {
  const out: Partial<SectionDigest> = { ...s };
  for (const [key, value] of Object.entries(SECTION_DEFAULTS)) {
    const k = key as keyof typeof SECTION_DEFAULTS;
    const v = s[k];
    if (Array.isArray(v) ? v.length === 0 : v === value) delete out[k];
  }
  return out;
}

const KIND_HEADING = {
  lecture: 'Lectures',
  standaloneLab: 'Labs (standalone)',
  discussion: 'Discussions',
  lab: 'Labs',
} as const;

/** "any lecture", "all but BL01" or "with BL02, BL05" for a companion. */
function pairing(s: SectionView, lectures: SectionView[]): string {
  const names = (crns: number[]) =>
    lectures.filter(l => crns.includes(l.crn)).map(l => l.number);
  if (lectures.every(l => s.pairsWith.includes(l.crn))) return 'any lecture';
  const missing = lectures
    .filter(l => !s.pairsWith.includes(l.crn))
    .map(l => l.crn);
  if (lectures.length >= 4 && missing.length <= 2) {
    return `all lectures but ${names(missing).join(', ')}`;
  }
  return `with ${names(s.pairsWith).join(', ')}`;
}

/** A term under way: late adds need approval. */
const inProgress = (dates: DateSpan) =>
  `in progress (started ${dates.start}): adding late may need instructor or registrar approval`;

function termBlock(
  term: string,
  sections: SectionView[],
  dates: DateSpan | undefined,
  today: string,
  tentative: boolean,
): string[] {
  const span = dates ? ` (${dates.start} to ${dates.end})` : '';
  const ended =
    dates && dates.end < today ? ', ENDED: can no longer be taken' : '';
  const early = tentative
    ? ', TENTATIVE: early entry, not yet published or registrable'
    : '';
  const running =
    !tentative && dates && dates.start <= today && today <= dates.end
      ? `, ${inProgress(dates)}`
      : '';
  const lines = [`${term} term${span}${ended}${running}${early}:`];
  const lectures = sections.filter(s => s.kind === 'lecture');
  for (const kind of [
    'lecture',
    'standaloneLab',
    'discussion',
    'lab',
  ] as const) {
    const ofKind = sections.filter(s => s.kind === kind);
    if (!ofKind.length) continue;
    const companion = kind === 'discussion' || kind === 'lab';
    const notes = companion ? ofKind.map(s => pairing(s, lectures)) : [];
    const shared = notes.length && notes.every(n => n === notes[0]);
    lines.push(
      ` ${KIND_HEADING[kind]}${shared ? ` (${notes[0]} this term)` : ''}:`,
    );
    ofKind.forEach((s, i) => {
      const note = companion && !shared ? ` | ${notes[i]}` : '';
      lines.push(`  ${viewLine(s, dates)}${note}`);
    });
  }
  return lines;
}

export function renderCourse(
  d: CourseDetail,
  notices: string[],
  context: SeatData & {
    termDates: Partial<Record<TermLetter, DateSpan>> | null;
    today: string;
  },
): string {
  const lines: string[] = [];
  lines.push(
    [
      `${d.code} ${d.name}`,
      d.year !== null ? yearLabel(d.year) : null,
      credits(d),
      d.departmentName,
      d.isGraduate ? 'graduate' : 'undergraduate',
    ]
      .filter(Boolean)
      .join(' | '),
  );
  lines.push(...notices);

  const facts: string[] = [];
  facts.push(
    `Offering: ${d.category ? CATEGORY_TEXT[d.category] : 'no category on record'}`,
  );
  facts.push(attributesFact(d.degreeAttributes));
  if (d.courseTypes.length) facts.push(`Type: ${d.courseTypes.join(', ')}`);
  facts.push(
    d.crossListedWith.length
      ? `Also listed as ${d.crossListedWith.join(', ')} (same class, register under either)`
      : 'Cross-listed: none',
  );
  lines.push(facts.join(' | '));
  if (d.nextYear) lines.push(`Next year: ${d.nextYear.summary}`);
  lines.push(...describe(d));

  const hidden: string[] = [];
  const { omitted } = d;
  if (omitted.endedTerms.length)
    hidden.push(
      `${omitted.endedTerms.join(', ')} term (ended; includeEndedTerms: true shows it)`,
    );
  if (omitted.otherTerms.length)
    hidden.push(`${omitted.otherTerms.join(', ')} term (not asked for)`);
  if (omitted.interestLists.length)
    hidden.push(
      `interest lists for ${omitted.interestLists.join(', ')} (placeholders to join before sections open)`,
    );
  if (omitted.fullSections)
    hidden.push(
      `${plural(omitted.fullSections, 'full section')} (includeFull: true)`,
    );
  if (hidden.length) lines.push(`Not shown: ${hidden.join('; ')}.`);

  if (d.sections.length === 0) {
    lines.push('No sections to show.');
    return lines.join('\n');
  }

  lines.push('Status and mode shown only when not Open / In-Person.');
  if (d.lectureGroups.some(g => g.labs.length || g.discussions.length)) {
    lines.push(
      'Take one lecture plus one of each companion kind (lab, discussion) listed for it.',
    );
  }

  const terms = [...new Set(d.sections.map(s => s.term))];
  for (const term of terms) {
    lines.push(
      ...termBlock(
        term,
        d.sections.filter(s => s.term === term),
        context.termDates?.[term as TermLetter],
        context.today,
        d.earlyEntry,
      ),
    );
  }
  if (d.sections.some(waitlistBesideSeats)) lines.push(WAITLIST_NOTE);
  if (d.sections.some(isUncapped)) lines.push(MEMBERSHIP_NOTE);
  lines.push(
    seatDataLine(
      context,
      d.sections.some(s => isLow(s.seatsAvailable)),
    ),
  );
  return lines.join('\n');
}

function attributesFact(attributes: string[]): string {
  return attributes.length
    ? `Counts toward: ${attributes.join(', ')}`
    : 'Degree attributes: none on record (tags are incomplete; see the degree audit)';
}

export function renderPlan(plan: CoursePlan, notices: string[]): string {
  const c = plan.course;
  const lines = [
    `${c.code} ${c.name} | planning for ${yearLabel(plan.forecast.year)} | ${credits(c)}`,
    ...notices,
    plan.forecast.summary,
  ];
  lines.push(
    [
      attributesFact(c.degreeAttributes),
      c.crossListedWith.length
        ? `Also listed as ${c.crossListedWith.join(', ')}`
        : 'Cross-listed: none',
    ].join(' | '),
  );
  lines.push(...describe(c));
  lines.push(
    `For this year's sections and times, call get_course without a year.`,
  );
  return lines.join('\n');
}

// --- check_conflicts --------------------------------------------------------

/**
 * Conflict and busy lines check_conflicts lists, each, before a count: 100
 * CRNs against 20 all-day busy blocks would otherwise list thousands.
 */
const MAX_CONFLICT_LINES = 25;

/**
 * check_conflicts' structuredContent: the check, with its conflict and busy
 * lists cut where the text cuts them and the counts left out in `notListed`.
 * HTTP sends them all.
 */
export function conflictData(check: ConflictCheck) {
  return {
    ...check,
    conflicts: check.conflicts.slice(0, MAX_CONFLICT_LINES),
    busyConflicts: check.busyConflicts.slice(0, MAX_CONFLICT_LINES),
    notListed: {
      conflicts: Math.max(0, check.conflicts.length - MAX_CONFLICT_LINES),
      busyConflicts: Math.max(
        0,
        check.busyConflicts.length - MAX_CONFLICT_LINES,
      ),
    },
  };
}

export function renderConflicts(check: ConflictCheck): string {
  const lines: string[] = [];
  if (check.duplicates.length) {
    lines.push(
      `CRN ${check.duplicates.join(', ')} given more than once; checked once.`,
    );
  }
  const name = (s: ConflictCheck['conflicts'][number]['a']) =>
    `${s.courses.join('/')} ${s.section} (CRN ${s.crn}, ${s.term})`;
  for (const { a, b, overlaps } of check.conflicts.slice(
    0,
    MAX_CONFLICT_LINES,
  )) {
    const when = overlaps.length
      ? `: both meet ${overlaps.map(o => `${o.days.join('')} ${o.start}-${o.end}`).join(', ')}`
      : '';
    lines.push(`CONFLICT ${name(a)} and ${name(b)}${when}.`);
  }
  const moreConflicts = check.conflicts.length - MAX_CONFLICT_LINES;
  if (moreConflicts > 0) {
    lines.push(
      `+${plural(moreConflicts, 'more conflicting pair')} not listed; check fewer CRNs at a time to see them.`,
    );
  }
  const band = (o: { days: string[]; start: string; end: string }) =>
    `${o.days.join(',')} ${o.start}-${o.end}`;
  for (const { section, busy, overlaps } of check.busyConflicts.slice(
    0,
    MAX_CONFLICT_LINES,
  )) {
    const what = busy.label ? `"${busy.label}" (${band(busy)})` : band(busy);
    lines.push(
      `BUSY ${name(section)} meets during ${what}: ${overlaps.map(band).join(', ')}.`,
    );
  }
  const moreBusy = check.busyConflicts.length - MAX_CONFLICT_LINES;
  if (moreBusy > 0) {
    lines.push(
      `+${plural(moreBusy, 'more section and busy-time overlap')} not listed.`,
    );
  }
  for (const issue of check.issues) {
    lines.push(
      `${issue.severity === 'error' ? 'PROBLEM' : 'Note'}: ${issue.message}`,
    );
  }

  const errors = check.issues.filter(i => i.severity === 'error').length;
  const n = check.checked.length;
  const pairs =
    n === 0
      ? 'No known sections to compare.'
      : n < 2
        ? 'One section, so no times to compare.'
        : check.conflicts.length
          ? `${plural(check.conflicts.length, 'time conflict')} among ${n} sections; other pairs fit.`
          : `No time conflicts among these ${n} sections.`;
  const busySections = new Set(check.busyConflicts.map(b => b.section.crn))
    .size;
  const busy =
    check.busyBlocks === 0 || n === 0
      ? ''
      : busySections
        ? `${plural(busySections, 'section')} ${one(busySections, 'meets', 'meet')} during your busy times.`
        : 'None meets during your busy times.';
  const times = [pairs, busy].filter(Boolean).join(' ');
  const missing = check.issues.some(i => i.kind === 'missingCompanion');
  const verdict = errors
    ? `${plural(errors, 'problem')} to fix before registering.`
    : check.conflicts.length || check.busyConflicts.length
      ? ''
      : missing
        ? 'Not a complete set yet: add the labs or discussions noted.'
        : 'No time conflicts or section problems found; prerequisites and eligibility are not checked.';
  lines.push([times, verdict].filter(Boolean).join(' '));
  if (n > 0) {
    lines.push(
      seatDataLine(
        check,
        check.issues.some(i => i.kind === 'lowSeats'),
      ),
    );
  }
  return lines.join('\n');
}

// --- get_catalog_info -------------------------------------------------------

function termNowText(now: TermNow, today: string): string {
  if (now.term) return `Today is ${today}, in ${now.term} term.`;
  const parts = [`Today is ${today}, between terms`];
  if (now.previous)
    parts.push(`${now.previous.term} ended ${now.previous.end}`);
  if (now.next) parts.push(`${now.next.term} starts ${now.next.start}`);
  return `${parts.join('; ')}.`;
}

export function renderCatalogInfo(
  meta: ReturnType<typeof catalogMeta>,
): string {
  const lines = [
    termNowText(meta.currentTerm, meta.today),
    `Current academic year: ${meta.currentAcademicYear} (${yearLabel(meta.currentAcademicYear)}), the only one with schedules (sections, times, CRNs).`,
    `Data as of ${meta.dataAsOf ?? 'unknown'}${meta.dataAgeDays === null ? '' : ` (${plural(meta.dataAgeDays, 'day')} old)`}; seat counts are from then.`,
    `Years: ${meta.years
      .map(
        y =>
          `${y.year} = ${yearLabel(y.year)} ${y.status}, ${plural(y.courseCount, 'course')}`,
      )
      .join('; ')}.`,
  ];
  for (const [year, dates] of Object.entries(meta.termDates)) {
    const state = (k: TermLetter) =>
      dates[k].end < meta.today
        ? ' (ended)'
        : dates[k].start <= meta.today
          ? ' (in progress)'
          : '';
    const t = (k: TermLetter) =>
      `${k} ${dates[k].start} to ${dates[k].end}${state(k)}`;
    lines.push(
      `${yearLabel(Number(year))} terms: ${QUARTERS.map(t).join(', ')}. Semesters: F (fall, A+B) ${dates.F.start} to ${dates.F.end}${state('F')}; S (spring, C+D) ${dates.S.start} to ${dates.S.end}${state('S')}.`,
    );
    const running = TERMS.filter(k => state(k) === ' (in progress)');
    if (running.length) {
      lines.push(
        `${running.join(' and ')} ${one(running.length, 'is', 'are')} in progress: adding a section late may need instructor or registrar approval.`,
      );
    }
  }
  lines.push(
    `Degree attributes in ${yearLabel(meta.currentAcademicYear)} (course counts), for filters.degreeAttribute: ${meta.degreeAttributes
      .map(a => `${a.name} (${a.courseCount})`)
      .join('; ')}.`,
    'Degree attribute tags are incomplete in the catalog data: a course without one may still count toward a requirement. Check the degree audit or an academic advisor.',
    `Delivery modes, for filters.deliveryMode: ${meta.deliveryModes.join(', ')}.`,
  );
  return lines.join('\n');
}
