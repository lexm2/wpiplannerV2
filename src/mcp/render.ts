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
import { isUncapped, SOLID_RATINGS } from '../api/serialize';

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

/** At or below this many open seats, a count from the last refresh may be gone. */
const LOW_SEATS = 3;

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
        : `Seat data is ${days === 1 ? '1 day' : `${days} days`} old (${date})`;
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
  waitlist: number;
}): string {
  if (isUncapped(s)) return 'no seat cap';
  const open =
    s.seatsAvailable > 0
      ? `${s.seatsAvailable}/${s.seats} open`
      : `FULL ${s.seats - s.seatsAvailable}/${s.seats}`;
  return s.waitlist > 0 ? `${open}, waitlist ${s.waitlist}` : open;
}

/** Status and mode only when they are not the common Open / In-Person. */
function exceptions(s: { status: string; deliveryMode: string }): string[] {
  const parts: string[] = [];
  if (s.status && s.status !== 'Open') parts.push(s.status);
  if (s.deliveryMode && s.deliveryMode !== 'In-Person')
    parts.push(s.deliveryMode);
  return parts;
}

function briefLine(s: SectionBrief, withTerm: boolean): string {
  return [
    `${s.number} CRN ${s.crn}${withTerm ? ` ${s.term}` : ''}`,
    s.meets,
    s.location,
    s.instructors.map(i => instructor(i)).join('; '),
    seats(s),
    ...exceptions(s),
  ]
    .filter(Boolean)
    .join(' | ');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The description, then its prerequisite and background statements on lines
 * of their own, cut from the description so they are not read twice.
 */
function describe(c: {
  description: string;
  prerequisites: string | null;
  recommendedBackground: string | null;
}): string[] {
  let description = c.description;
  const cut = (marker: string, statement: string | null) => {
    if (!statement) return;
    description = description.replace(
      new RegExp(`\\s*${marker}\\s*${escapeRegExp(statement)}`, 'i'),
      ' ',
    );
  };
  cut(
    '(?:recommended|suggested|required) background:',
    c.recommendedBackground,
  );
  cut('prerequisites?:', c.prerequisites);
  const lines: string[] = [];
  if (description.trim()) lines.push(`Description: ${description.trim()}`);
  // Said either way, so a missing line cannot read as "not shown".
  lines.push(
    c.prerequisites
      ? `Prerequisites (as the description states): ${c.prerequisites}`
      : 'Prerequisites: none stated in the catalog description.',
  );
  const background = c.recommendedBackground?.replace(/\.$/, '');
  lines.push(`Recommended background: ${background ?? 'none stated'}.`);
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
      return `mentions ${search.query.trim()}`;
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
): string {
  const parts = [
    `${index}. ${c.code} ${c.name}`,
    credits(c),
    c.terms.length ? c.terms.join(',') : 'no sections',
    rowSeats(c),
  ];
  const note = matchNote(c, search);
  if (note) parts.splice(1, 0, `(${note})`);
  if (c.category) parts.push(`Cat. ${'I'.repeat(c.category)}`);
  if (c.topInstructor) {
    const t = c.topInstructor;
    parts.push(`top ${t.name} ${ratingText(t, false)}`);
  }
  if (c.degreeAttributes.length) parts.push(c.degreeAttributes.join(', '));
  if (c.crossListedWith.length)
    parts.push(`also listed as ${c.crossListedWith.join(', ')}`);
  if (c.isGraduate) parts.push('graduate');
  if (showYear && c.year !== null) parts.push(yearLabel(c.year));
  return parts.join(' | ');
}

/** Which filter emptied a search, and what leaving it out would find. */
function relaxationLines(
  relaxations: CourseQueryResult['relaxations'],
): string[] {
  if (!relaxations.length) return [];
  const helps = relaxations.filter(r => r.total > 0);
  const stuck = relaxations.filter(r => r.total === 0).map(r => r.filter);
  const lines: string[] = [];
  if (helps.length) {
    lines.push(
      `Most restrictive: filters.${helps[0].filter}. Leaving out one filter at a time: ${helps
        .map(
          r =>
            `without ${r.filter}, ${r.total} course${r.total === 1 ? '' : 's'}${r.terms.length ? ` (in ${r.terms.join(', ')})` : ''}`,
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
  return lines;
}

export function renderSearch(result: CourseQueryResult): string {
  const lines: string[] = [];
  const where = result.year === 'all' ? 'all years' : yearLabel(result.year);
  if (result.total === 0) {
    lines.push(`No matching courses in ${where}.`);
    lines.push(...relaxationLines(result.relaxations));
  } else {
    const last = Math.min(result.offset + result.limit, result.total);
    const range =
      result.offset >= result.total
        ? 'none on this page'
        : `${result.offset + 1}-${last}`;
    lines.push(
      `Courses ${range} of ${result.total} in ${where}; seats count only the sections that matched.`,
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
      'Sections: number, CRN, term | meetings | room | instructor | seats; status and mode shown only when not Open / In-Person.',
    );
  }

  result.courses.forEach((c, i) => {
    lines.push(
      rowLine(c, result.offset + i + 1, result.year === 'all', result.search),
    );
    if (!c.sections) return;
    for (const s of c.sections.slice(0, MAX_ROW_SECTIONS)) {
      lines.push(`   ${briefLine(s, true)}`);
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
    lines.push(
      `All ${plural(totals.courses, 'matching course')}, every page: ${seatsText} (cross-listed sections counted once).`,
    );
  }
  const low = result.courses.some(c =>
    c.sections
      ? c.sections.some(s => isLow(s.seatsAvailable))
      : c.seatsByTerm.some(t => isLow(t.available)),
  );
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
  waitlist: number;
  status: string;
  deliveryMode: string;
  meetsWith: string[];
}

function digestSection(s: SectionView): SectionDigest {
  const meets = [
    ...new Set(
      s.periods.map(p =>
        p.isAsync
          ? 'Async'
          : p.start && p.end
            ? `${p.days.join('')} ${p.start}-${p.end}`
            : 'TBD',
      ),
    ),
  ].join('; ');
  const people = new Map<string, InstructorView>();
  for (const p of s.periods)
    for (const i of p.instructors) people.set(i.name, i);
  return {
    crn: s.crn,
    number: s.number,
    term: s.term,
    kind: s.kind,
    pairsWith: s.pairsWith,
    meets: meets || 'TBD',
    location: [...new Set(s.periods.map(p => p.location).filter(Boolean))].join(
      '; ',
    ),
    instructors: [...people.keys()],
    seats: s.seats,
    seatsAvailable: s.seatsAvailable,
    waitlist: s.waitlist,
    status: s.status,
    deliveryMode: s.deliveryMode,
    meetsWith: s.meetsWith,
  };
}

function viewLine(s: SectionView): string {
  const d = digestSection(s);
  const people = new Map<string, InstructorView>();
  for (const p of s.periods)
    for (const i of p.instructors) people.set(i.name, i);
  return [
    `${d.number} CRN ${d.crn}`,
    d.meets,
    d.location,
    [...people.values()].map(i => instructor(i, true)).join('; '),
    seats(s),
    ...exceptions(s),
    ...(d.meetsWith.length ? [`meets with ${d.meetsWith.join(', ')}`] : []),
  ]
    .filter(Boolean)
    .join(' | ');
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
    omitted: d.omitted,
    ratings: ratingsOf(d.sections),
    dataAsOf,
    dataAgeDays,
    notices,
    // Fields left out at their common value, as the text leaves them out.
    sectionDefaults: SECTION_DEFAULTS,
    sections: d.sections.map(s => withoutDefaults(digestSection(s))),
  };
}

/** Rate My Professor numbers per instructor shown, rated ones only. */
function ratingsOf(sections: SectionView[]) {
  const ratings: Record<string, Omit<Rating, 'url'>> = {};
  for (const s of sections)
    for (const p of s.periods)
      for (const i of p.instructors) {
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

function termBlock(
  term: string,
  sections: SectionView[],
  dates: DateSpan | undefined,
  today: string,
): string[] {
  const span = dates ? ` (${dates.start} to ${dates.end})` : '';
  const ended =
    dates && dates.end < today ? ', ENDED: can no longer be taken' : '';
  const lines = [`${term} term${span}${ended}:`];
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
      lines.push(`  ${viewLine(s)}${note}`);
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
      `${omitted.fullSections} full section${omitted.fullSections === 1 ? '' : 's'} (includeFull: true)`,
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
      ),
    );
  }
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
    : 'Degree attributes: none';
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

export function renderConflicts(check: ConflictCheck): string {
  const lines: string[] = [];
  if (check.duplicates.length) {
    lines.push(
      `CRN ${check.duplicates.join(', ')} given more than once; checked once.`,
    );
  }
  const name = (s: ConflictCheck['conflicts'][number]['a']) =>
    `${s.courses.join('/')} ${s.section} (CRN ${s.crn}, ${s.term})`;
  for (const { a, b, overlaps } of check.conflicts) {
    const when = overlaps.length
      ? `: both meet ${overlaps.map(o => `${o.days.join('')} ${o.start}-${o.end}`).join(', ')}`
      : '';
    lines.push(`CONFLICT ${name(a)} and ${name(b)}${when}.`);
  }
  const band = (o: { days: string[]; start: string; end: string }) =>
    `${o.days.join(',')} ${o.start}-${o.end}`;
  for (const { section, busy, overlaps } of check.busyConflicts) {
    const what = busy.label ? `"${busy.label}" (${band(busy)})` : band(busy);
    lines.push(
      `BUSY ${name(section)} meets during ${what}: ${overlaps.map(band).join(', ')}.`,
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
          ? `${check.conflicts.length} time conflict${check.conflicts.length === 1 ? '' : 's'} among ${n} sections; other pairs fit.`
          : `No time conflicts among these ${n} sections.`;
  const busySections = new Set(check.busyConflicts.map(b => b.section.crn))
    .size;
  const busy =
    check.busyBlocks === 0 || n === 0
      ? ''
      : busySections
        ? `${busySections === 1 ? '1 section meets' : `${busySections} sections meet`} during your busy times.`
        : 'None meets during your busy times.';
  const times = [pairs, busy].filter(Boolean).join(' ');
  const missing = check.issues.some(i => i.kind === 'missingCompanion');
  const verdict = errors
    ? `${errors} problem${errors === 1 ? '' : 's'} to fix before registering.`
    : check.conflicts.length || check.busyConflicts.length
      ? ''
      : missing
        ? 'Not a complete set yet: add the labs or discussions noted.'
        : 'They make a valid set to register in Workday.';
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
    `Data as of ${meta.dataAsOf ?? 'unknown'}${meta.dataAgeDays === null ? '' : ` (${meta.dataAgeDays} day${meta.dataAgeDays === 1 ? '' : 's'} old)`}; seat counts are from then.`,
    `Years: ${meta.years
      .map(
        y =>
          `${y.year} = ${yearLabel(y.year)} ${y.status}, ${y.courseCount} course${y.courseCount === 1 ? '' : 's'}`,
      )
      .join('; ')}.`,
  ];
  for (const [year, dates] of Object.entries(meta.termDates)) {
    const t = (k: TermLetter) =>
      `${k} ${dates[k].start} to ${dates[k].end}${dates[k].end < meta.today ? ' (ended)' : ''}`;
    lines.push(
      `${yearLabel(Number(year))} terms: ${(['A', 'B', 'C', 'D'] as const).map(t).join(', ')}. Semesters: F (fall, A+B) ${dates.F.start} to ${dates.F.end}; S (spring, C+D) ${dates.S.start} to ${dates.S.end}.`,
    );
  }
  lines.push(
    `Degree attributes in ${yearLabel(meta.currentAcademicYear)} (course counts), for filters.degreeAttribute: ${meta.degreeAttributes
      .map(a => `${a.name} (${a.courseCount})`)
      .join('; ')}.`,
    `Delivery modes, for filters.deliveryMode: ${meta.deliveryModes.join(', ')}.`,
  );
  return lines.join('\n');
}
