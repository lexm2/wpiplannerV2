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

/** The once-per-response caveat for low seat counts. */
function lowSeatsCaveat(dataAsOf: string | null): string {
  return `Seat counts are from ${asOf(dataAsOf)}; low counts (${LOW_SEATS} or fewer) may already be gone.`;
}

function instructor(i: InstructorView): string {
  return i.rmp ? `${i.name} RMP ${i.rmp.rating} (${i.rmp.numRatings})` : i.name;
}

function seats(s: {
  seats: number;
  seatsAvailable: number;
  waitlist: number;
}): string {
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
    s.instructors.map(instructor).join('; '),
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
  if (c.prerequisites)
    lines.push(`Prerequisites (as the description states): ${c.prerequisites}`);
  if (c.recommendedBackground)
    lines.push(`Recommended background: ${c.recommendedBackground}`);
  return lines;
}

// --- search_courses ---------------------------------------------------------

const totalSeats = (t: SeatTotals) =>
  seats({
    seats: t.capacity,
    seatsAvailable: t.available,
    waitlist: t.waitlisted,
  });

/** One total, or per term when the course spans several: "C FULL 90/90 · D 2/66 open". */
function rowSeats(c: CourseRow): string {
  if (c.seatsByTerm.length <= 1) return totalSeats(c.seats);
  return c.seatsByTerm.map(t => `${t.term} ${totalSeats(t)}`).join(' · ');
}

function rowLine(c: CourseRow, index: number, showYear: boolean): string {
  const parts = [
    `${index}. ${c.code} ${c.name}`,
    credits(c),
    c.terms.length ? c.terms.join(',') : 'no sections',
    rowSeats(c),
  ];
  if (c.category) parts.push(`Cat. ${'I'.repeat(c.category)}`);
  if (c.topInstructor) {
    const t = c.topInstructor;
    parts.push(`top RMP ${t.name} ${t.rating} (${t.numRatings})`);
  }
  if (c.degreeAttributes.length) parts.push(c.degreeAttributes.join(', '));
  if (c.crossListedWith.length)
    parts.push(`also listed as ${c.crossListedWith.join(', ')}`);
  if (c.isGraduate) parts.push('graduate');
  if (showYear && c.year !== null) parts.push(yearLabel(c.year));
  return parts.join(' | ');
}

export function renderSearch(result: CourseQueryResult): string {
  const lines: string[] = [];
  const where = result.year === 'all' ? 'all years' : yearLabel(result.year);
  if (result.total === 0) {
    lines.push(`No matching courses in ${where}.`);
  } else {
    const last = Math.min(result.offset + result.limit, result.total);
    const range =
      result.offset >= result.total
        ? 'none on this page'
        : `${result.offset + 1}-${last}`;
    lines.push(
      `Courses ${range} of ${result.total} in ${where}. Seats as of ${asOf(result.dataAsOf)}, counting only the sections that matched.`,
    );
  }
  lines.push(...result.notices);
  if (result.courses.some(c => c.sections)) {
    lines.push(
      'Sections: number, CRN, term | meetings | room | instructor | seats; status and mode shown only when not Open / In-Person.',
    );
  }

  result.courses.forEach((c, i) => {
    lines.push(rowLine(c, result.offset + i + 1, result.year === 'all'));
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
    const { openSeats, sections, courses } = result.totals;
    lines.push(
      `All ${courses} matching course${courses === 1 ? '' : 's'}, every page: ${openSeats} open seat${openSeats === 1 ? '' : 's'} in ${sections} section${sections === 1 ? '' : 's'} (cross-listed sections counted once).`,
    );
  }
  const low = result.courses.some(c =>
    c.sections
      ? c.sections.some(s => isLow(s.seatsAvailable))
      : c.seatsByTerm.some(t => isLow(t.available)),
  );
  if (low) lines.push(lowSeatsCaveat(result.dataAsOf));
  return lines.join('\n');
}

// --- get_course -------------------------------------------------------------

function viewLine(s: SectionView): string {
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
  const rooms = [
    ...new Set(s.periods.map(p => p.location).filter(Boolean)),
  ].join('; ');
  const people = new Map<string, InstructorView>();
  for (const p of s.periods)
    for (const i of p.instructors) people.set(i.name, i);
  return [
    `${s.number} CRN ${s.crn}`,
    meets || 'TBD',
    rooms,
    [...people.values()].map(instructor).join('; '),
    seats(s),
    ...exceptions(s),
    ...(s.meetsWith.length ? [`meets with ${s.meetsWith.join(', ')}`] : []),
  ]
    .filter(Boolean)
    .join(' | ');
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
  context: {
    dataAsOf: string | null;
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
  if (d.degreeAttributes.length)
    facts.push(`Counts toward: ${d.degreeAttributes.join(', ')}`);
  if (d.courseTypes.length) facts.push(`Type: ${d.courseTypes.join(', ')}`);
  if (d.crossListedWith.length)
    facts.push(
      `Also listed as ${d.crossListedWith.join(', ')} (same class, register under either)`,
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

  lines.push(
    `Seats as of ${asOf(context.dataAsOf)}. Status and mode shown only when not Open / In-Person.`,
  );
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
  if (d.sections.some(s => isLow(s.seatsAvailable))) {
    lines.push(lowSeatsCaveat(context.dataAsOf));
  }
  return lines.join('\n');
}

export function renderPlan(plan: CoursePlan, notices: string[]): string {
  const c = plan.course;
  const lines = [
    `${c.code} ${c.name} | planning for ${yearLabel(plan.forecast.year)} | ${credits(c)}`,
    ...notices,
    plan.forecast.summary,
  ];
  if (c.degreeAttributes.length)
    lines.push(`Counts toward: ${c.degreeAttributes.join(', ')}`);
  if (c.crossListedWith.length)
    lines.push(`Also listed as ${c.crossListedWith.join(', ')}`);
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
  if (check.checked.length < 2) {
    lines.push(
      `Only one section (CRN ${check.checked[0]}); nothing to compare. Pass two or more CRNs.`,
    );
    return lines.join('\n');
  }
  if (check.conflicts.length === 0) {
    lines.push(
      `No conflicts: these ${check.checked.length} sections fit together.`,
    );
    return lines.join('\n');
  }
  const name = (s: ConflictCheck['conflicts'][number]['a']) =>
    `${s.courses.join('/')} ${s.section} (CRN ${s.crn}, ${s.term})`;
  for (const { a, b, overlaps } of check.conflicts) {
    const when = overlaps.length
      ? `: both meet ${overlaps.map(o => `${o.days.join('')} ${o.start}-${o.end}`).join(', ')}`
      : '';
    lines.push(`CONFLICT ${name(a)} and ${name(b)}${when}.`);
  }
  lines.push(
    `${check.conflicts.length} conflicting pair${check.conflicts.length === 1 ? '' : 's'} among ${check.checked.length} sections; other pairs fit.`,
  );
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
    `Data as of ${meta.dataAsOf ?? 'unknown'}; seat counts are from then.`,
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
