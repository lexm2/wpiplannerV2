/**
 * A set of CRNs checked as a schedule: time conflicts between them, decided
 * by the app's own ConflictFilter so semester sections clash with the
 * quarters they span, overlaps with the student's busy blocks (a work
 * shift), and whether they make a registrable set: each lab or discussion
 * with a lecture it goes with, the companions each lecture needs, one
 * lecture per course, CRNs the catalog lacks, and sections that are full,
 * closed, ended or nearly full.
 */
import * as z from 'zod';
import type { WeeklyTimeSlot } from '../types/schedule';
import { AcademicTerm } from '../types/schedule';
import type { Course, LectureGroup, Section } from '../types/types';
import { DayOfWeek, SectionType } from '../types/types';
import { ConflictFilter } from '../core/filtering/filters/ConflictFilter';
import { sectionToWeeklySlots, slotsOverlap } from '../utils/timeSlotUtils';
import { currentAcademicYear, type Catalog, type CrnEntry } from './catalog';
import {
  endedTerms,
  seatDataAge,
  termDates,
  today,
  yearLabel,
  yearStatus,
  type TermLetter,
} from './calendar';
import { ApiError, listSome, withoutControls } from './errors';
import { ClockSchema, EndClockSchema, clockMinutes, clockText } from './clock';
import { courseCode, isUncapped } from './serialize';

/** CRNs a schedule check, or a search fitted around CRNs, takes at most. */
export const MAX_CRNS = 100;

const BusyBlockSchema = z
  .object({
    days: z
      .array(z.enum(DayOfWeek))
      .min(1)
      .describe('M, T, W, R (Thursday), F, S, U; ["T", "R"] for Tue/Thu.'),
    start: ClockSchema.describe('24-hour start, "13:00".'),
    end: EndClockSchema.describe(
      '24-hour end, exclusive, "17:00"; "24:00" for the end of the day.',
    ),
    label: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .optional()
      .describe('What it is, for the report: "work", "practice".'),
  })
  .strict()
  .refine(
    b => clockMinutes(b.end) > clockMinutes(b.start),
    'end must be after start',
  );

/** check_conflicts' and POST /conflicts' input: one schema for both. */
export const ConflictCheckInputSchema = z
  .object({
    crns: z
      .array(z.number().int().positive())
      .min(1)
      .max(MAX_CRNS)
      .describe(
        'CRNs of the sections to check together, lectures and labs alike.',
      ),
    busy: z
      .array(BusyBlockSchema)
      .max(20)
      .optional()
      .describe(
        'Weekly times the student is busy (a job, practice), every term: each section meeting during one is reported.',
      ),
  })
  .strict();

export type BusyBlock = z.infer<typeof BusyBlockSchema>;

/** Thrown for CRNs the catalog lacks. */
class UnknownCrnError extends ApiError {
  constructor(readonly crns: number[]) {
    super(
      `Unknown CRN${crns.length === 1 ? '' : 's'}: ${listSome(crns)}. Get CRNs from get_course or search_courses.`,
      400,
      { unknownCrns: crns },
    );
  }
}

function lookup(
  catalog: Catalog,
  crns: number[],
): { found: Map<number, CrnEntry>; missing: number[] } {
  const found = new Map<number, CrnEntry>();
  const missing: number[] = [];
  for (const crn of new Set(crns)) {
    const entry = catalog.sectionsByCrn.get(crn);
    if (entry) found.set(crn, entry);
    else missing.push(crn);
  }
  return { found, missing };
}

/**
 * The weekly slots the given sections occupy, as ConflictFilter's
 * blockedSlots, for a search of `year`. Each slot id starts with its CRN,
 * which is how the filter keeps a section from conflicting with itself.
 * Slots carry a term but no year, so CRNs of another year (2027-28's B03
 * against this year's B) are left out and returned in `otherYear`.
 */
export function blockedSlotsForCrns(
  catalog: Catalog,
  crns: number[],
  year: number | 'all',
): { slots: WeeklyTimeSlot[]; otherYear: number[] } {
  const { found, missing } = lookup(catalog, crns);
  // A search fitted around a CRN that does not exist is bad input.
  if (missing.length > 0) throw new UnknownCrnError(missing);
  const otherYear: number[] = [];
  const slots: WeeklyTimeSlot[] = [];
  for (const [crn, entry] of found) {
    if (year !== 'all' && yearOf(catalog, entry) !== year) {
      otherYear.push(crn);
    } else {
      slots.push(...sectionToWeeklySlots(entry.section));
    }
  }
  return { slots, otherYear };
}

/**
 * Whether two sections' own date ranges share a day. Most run their whole
 * term, but some run half of it (BB 3813 BX01 to Nov 12, BX02 from Nov 16)
 * or half a semester. Unknown dates are taken to meet.
 */
function datesMeet(a: Section, b: Section): boolean {
  if (!a.startDate || !a.endDate || !b.startDate || !b.endDate) return true;
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/** The academic year a CRN's section belongs to. */
const yearOf = (catalog: Catalog, entry: CrnEntry) =>
  entry.courses[0].academicYear ?? currentAcademicYear(catalog);

interface ConflictSide {
  crn: number;
  section: string;
  term: string;
  /** Every course listing this CRN; cross-listed courses share sections. */
  courses: string[];
}

/** When both sections meet: these days, from start to end ("HH:MM"). */
interface Overlap {
  days: string[];
  start: string;
  end: string;
}

interface ConflictPair {
  a: ConflictSide;
  b: ConflictSide;
  overlaps: Overlap[];
}

/** A section meeting during one of the student's busy blocks. */
interface BusyConflict {
  section: ConflictSide;
  busy: { label: string | null; days: string[]; start: string; end: string };
  overlaps: Overlap[];
}

/**
 * Something that keeps the CRNs from being registered as given (error) or
 * that the student should know before trying (warning).
 */
interface ScheduleIssue {
  severity: 'error' | 'warning';
  kind:
    | 'unknownCrn'
    | 'unpaired'
    | 'missingCompanion'
    | 'sameCourse'
    | 'interestList'
    | 'ended'
    | 'pastYear'
    | 'otherYear'
    | 'closed'
    | 'full'
    | 'lowSeats'
    | 'inProgress'
    | 'membership';
  /** The CRNs the issue is about. */
  crns: number[];
  message: string;
}

export interface ConflictCheck {
  /** The distinct CRNs compared, in the order given. */
  checked: number[];
  /** CRNs given more than once, compared once. */
  duplicates: number[];
  conflicts: ConflictPair[];
  /** Sections meeting during a busy block, in any term. */
  busyConflicts: BusyConflict[];
  /** Busy blocks checked against. */
  busyBlocks: number;
  /** Whether the sections make a registrable set; errors first. */
  issues: ScheduleIssue[];
  /** When the seat counts were read from WPI. */
  dataAsOf: string | null;
  /** Whole days since then (see seatDataAge). */
  dataAgeDays: number | null;
}

function side(crn: number, entry: CrnEntry): ConflictSide {
  return {
    crn,
    section: entry.section.number,
    term: entry.section.computedTerm,
    courses: entry.courses.map(courseCode),
  };
}

const SPANS: Partial<Record<string, string[]>> = {
  [AcademicTerm.F]: [AcademicTerm.A, AcademicTerm.B],
  [AcademicTerm.S]: [AcademicTerm.C, AcademicTerm.D],
};
const quarters = (term: AcademicTerm): string[] => SPANS[term] ?? [term];
const termsMeet = (a: AcademicTerm, b: AcademicTerm) =>
  a === AcademicTerm.ALL ||
  b === AcademicTerm.ALL ||
  quarters(a).some(q => quarters(b).includes(q));

const minutesOf = (t: { hours: number; minutes: number }) =>
  t.hours * 60 + t.minutes;
const DAY_ORDER: string[] = Object.values(DayOfWeek);

const inWeekOrder = (days: Iterable<string>) =>
  [...days].sort((x, y) => DAY_ORDER.indexOf(x) - DAY_ORDER.indexOf(y));

/** Days grouped by shared time band: "T,R 14:00-14:50". */
function bandsToOverlaps(bands: Map<string, Set<string>>): Overlap[] {
  return [...bands].map(([band, days]) => {
    const [start, end] = band.split('-');
    return { days: inWeekOrder(days), start, end };
  });
}

function addBand(
  bands: Map<string, Set<string>>,
  day: string,
  start: number,
  end: number,
) {
  const band = `${clockText(start)}-${clockText(end)}`;
  if (!bands.has(band)) bands.set(band, new Set());
  bands.get(band)!.add(day);
}

/** Where a section meets during a busy block, every term alike. */
function busyOverlaps(entry: CrnEntry, block: BusyBlock): Overlap[] {
  const start = clockMinutes(block.start);
  const end = clockMinutes(block.end);
  const days = new Set<string>(block.days);
  const bands = new Map<string, Set<string>>();
  for (const slot of sectionToWeeklySlots(entry.section)) {
    if (!days.has(slot.day)) continue;
    const from = Math.max(start, minutesOf(slot.startTime));
    const to = Math.min(end, minutesOf(slot.endTime));
    if (from < to) addBand(bands, slot.day, from, to);
  }
  return bandsToOverlaps(bands);
}

/** The shared meeting times of two sections, grouped by time band. */
function overlapsOf(a: CrnEntry, b: CrnEntry): Overlap[] {
  if (!termsMeet(a.section.computedTerm, b.section.computedTerm)) return [];
  const bands = new Map<string, Set<string>>();
  for (const sa of sectionToWeeklySlots(a.section)) {
    for (const sb of sectionToWeeklySlots(b.section)) {
      if (!slotsOverlap(sa, sb)) continue;
      addBand(
        bands,
        sa.day,
        Math.max(minutesOf(sa.startTime), minutesOf(sb.startTime)),
        Math.min(minutesOf(sa.endTime), minutesOf(sb.endTime)),
      );
    }
  }
  return bandsToOverlaps(bands);
}

/**
 * Every pair of the given sections that meets at the same time, every
 * section meeting during a busy block, and what keeps the set from being
 * registered. CRNs the catalog lacks are reported, and the rest checked.
 */
export function findConflicts(
  catalog: Catalog,
  crns: number[],
  busy: BusyBlock[] = [],
): ConflictCheck {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const crn of crns) {
    if (seen.has(crn)) duplicates.add(crn);
    seen.add(crn);
  }

  const { found, missing } = lookup(catalog, crns);
  const entries = [...found];
  const filter = new ConflictFilter();
  const conflicts: ConflictPair[] = [];

  for (let i = 0; i < entries.length; i++) {
    const [crnA, a] = entries[i];
    for (let j = i + 1; j < entries.length; j++) {
      const [crnB, b] = entries[j];
      // Another year's B term is not this one's, and a lab run in the
      // first half of B never meets one run in the second: never a clash.
      if (yearOf(catalog, a) !== yearOf(catalog, b)) continue;
      if (!datesMeet(a.section, b.section)) continue;
      const kept = filter.apply([a.filterable], {
        avoidConflicts: true,
        blockedSlots: sectionToWeeklySlots(b.section),
      });
      if (kept.length === 0) {
        conflicts.push({
          a: side(crnA, a),
          b: side(crnB, b),
          overlaps: overlapsOf(a, b),
        });
      }
    }
  }

  const busyConflicts: BusyConflict[] = [];
  for (const [crn, entry] of entries) {
    for (const block of busy) {
      const overlaps = busyOverlaps(entry, block);
      if (!overlaps.length) continue;
      busyConflicts.push({
        section: side(crn, entry),
        busy: {
          label: (block.label && withoutControls(block.label)) || null,
          days: inWeekOrder(block.days),
          start: clockText(clockMinutes(block.start)),
          end: clockText(clockMinutes(block.end)),
        },
        overlaps,
      });
    }
  }

  // One issue per unknown CRN, or one for them all when there are many.
  const unknown: ScheduleIssue[] =
    missing.length > MAX_NAMED
      ? [
          {
            severity: 'error',
            kind: 'unknownCrn',
            crns: missing,
            message: `${missing.length} CRNs are not sections in the catalog: ${listSome(missing)}; get CRNs from get_course or search_courses.`,
          },
        ]
      : missing.map(crn => ({
          severity: 'error',
          kind: 'unknownCrn',
          crns: [crn],
          message: `CRN ${crn} is not a section in the catalog; get CRNs from get_course or search_courses.`,
        }));
  return {
    checked: entries.map(([crn]) => crn),
    duplicates: [...duplicates],
    conflicts,
    busyConflicts,
    busyBlocks: busy.length,
    issues: [...unknown, ...scheduleIssues(catalog, new Map(entries))],
    dataAsOf: catalog.lastUpdated,
    dataAgeDays: seatDataAge(catalog),
  };
}

/** At or below this many open seats, the count may be gone by now. */
const LOW_SEATS = 3;
/** Sections named in a message before "+N more". */
const MAX_NAMED = 4;

const named = (s: Section) => `${s.number} (CRN ${s.crn})`;

function list(sections: Section[]): string {
  const shown = sections.slice(0, MAX_NAMED).map(named).join(', ');
  const more = sections.length - MAX_NAMED;
  return more > 0 ? `${shown} +${more} more` : shown;
}

const KIND_NAME: Partial<Record<SectionType, string>> = {
  [SectionType.LAB]: 'lab',
  [SectionType.DISCUSSION]: 'discussion',
};

const companionsOf = (g: LectureGroup, kind: SectionType) =>
  (kind === SectionType.LAB
    ? g.compatibleLabs
    : g.compatibleDiscussions
  ).filter(s => !s.isInterestList);

/** Lab and discussion pairing, missing companions and doubled lectures. */
function pairingIssues(
  course: Course,
  chosen: Map<number, CrnEntry>,
): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];
  const code = courseCode(course);
  // Interest lists are reported on their own, never as a second lecture.
  const ofType = (type: SectionType) =>
    [...chosen.values()]
      .filter(e => e.filterable.sectionType === type)
      .map(e => e.section)
      .filter(s => !s.isInterestList);
  const lectures = ofType(SectionType.LECTURE);
  const groups = course.lectures ?? [];
  const groupOf = (lecture: Section) =>
    groups.find(g => g.section.crn === lecture.crn);

  for (const type of [SectionType.LECTURE, SectionType.STANDALONE_LAB]) {
    const picked = ofType(type);
    if (picked.length > 1) {
      issues.push({
        severity: 'error',
        kind: 'sameCourse',
        crns: picked.map(s => s.crn),
        message: `${picked.length} ${code} ${type === SectionType.LECTURE ? 'lectures' : 'labs'} chosen, ${list(picked)}; take one.`,
      });
    }
  }

  for (const type of [SectionType.LAB, SectionType.DISCUSSION]) {
    const kind = KIND_NAME[type]!;
    for (const companion of ofType(type)) {
      const pairs = groups
        .filter(g => companionsOf(g, type).some(s => s.crn === companion.crn))
        .map(g => g.section);
      if (lectures.some(l => pairs.some(p => p.crn === l.crn))) continue;
      issues.push({
        severity: 'error',
        kind: 'unpaired',
        crns: [companion.crn, ...lectures.map(l => l.crn)],
        message: lectures.length
          ? `${code} ${kind} ${named(companion)} does not go with lecture ${list(lectures)}; it goes with ${list(pairs)}.`
          : `${code} ${kind} ${named(companion)} has no ${code} lecture chosen; it goes with ${list(pairs)}.`,
      });
    }
    for (const lecture of lectures) {
      const group = groupOf(lecture);
      if (!group) continue;
      const options = companionsOf(group, type);
      if (!options.length) continue;
      const picked = options.filter(o => chosen.has(o.crn));
      if (picked.length === 0) {
        issues.push({
          severity: 'warning',
          kind: 'missingCompanion',
          crns: [lecture.crn],
          message: `${code} ${named(lecture)} needs a ${kind}: none chosen (${options.length} go${options.length === 1 ? 'es' : ''} with it; get_course "${code}").`,
        });
      } else if (picked.length > 1) {
        issues.push({
          severity: 'error',
          kind: 'sameCourse',
          crns: picked.map(o => o.crn),
          message: `${picked.length} ${code} ${kind}s chosen for ${lecture.number}, ${list(picked)}; take one.`,
        });
      }
    }
  }
  return issues;
}

/** Placeholders, ended terms, past years, and registration status. */
function statusIssues(
  catalog: Catalog,
  crn: number,
  entry: CrnEntry,
): ScheduleIssue[] {
  const { section } = entry;
  const course = entry.courses[0];
  const who = `${courseCode(course)} ${named(section)}`;
  const issues: ScheduleIssue[] = [];
  const add = (
    severity: ScheduleIssue['severity'],
    kind: ScheduleIssue['kind'],
    message: string,
  ) => issues.push({ severity, kind, crns: [crn], message });

  if (section.isInterestList) {
    add(
      'error',
      'interestList',
      `${who} is an interest-list placeholder, not a section with times; pick a real section.`,
    );
    return issues;
  }
  const current = currentAcademicYear(catalog);
  const year = course.academicYear ?? current;
  if (year < current) {
    add('error', 'pastYear', `${who} is from ${yearLabel(year)}, a past year.`);
  } else if (year > current) {
    const early = yearStatus(catalog, year).status === 'not yet published';
    add(
      'error',
      'otherYear',
      early
        ? `${who} is a ${yearLabel(year)} early entry: that year's schedule is not published, so it cannot be registered for now, and its term and time may change.`
        : `${who} is from ${yearLabel(year)}, not the current year (${yearLabel(current)}); it is compared only with sections of its own year.`,
    );
  } else if (
    endedTerms(catalog, year).includes(section.computedTerm as TermLetter)
  ) {
    const end = termDates(catalog, year)?.[section.computedTerm as TermLetter]
      .end;
    add(
      'error',
      'ended',
      `${who} is in ${section.computedTerm} term, which ended${end ? ` ${end}` : ''}; it can no longer be taken.`,
    );
  }

  if (isUncapped(section)) {
    add(
      'warning',
      'membership',
      `${who} enrolls by team or ensemble membership; its seat count (${section.seats}) is a placeholder, not open seats.`,
    );
  }
  const waitlist = section.actualWaitlist
    ? `, ${section.actualWaitlist} on the waitlist`
    : '';
  if (section.status === 'Closed') {
    add(
      'error',
      'closed',
      `${who} is Closed for registration${section.seatsAvailable <= 0 ? ` and full (${section.seats - section.seatsAvailable}/${section.seats})` : ''}${waitlist}.`,
    );
  } else if (section.seats === 0) {
    add(
      'warning',
      'full',
      `${who} lists a capacity of 0${section.seatsAvailable < 0 ? ` with ${-section.seatsAvailable} enrolled` : ''}, though Open; ask the department whether it can be joined.`,
    );
  } else if (section.seatsAvailable <= 0) {
    add(
      'warning',
      'full',
      `${who} is FULL (${section.seats - section.seatsAvailable}/${section.seats}${waitlist})${section.status === 'Waitlist' ? '; registering means joining the waitlist' : ''}.`,
    );
  } else if (section.seatsAvailable <= LOW_SEATS) {
    add(
      'warning',
      'lowSeats',
      `${who} had only ${section.seatsAvailable === 1 ? '1 open seat' : `${section.seatsAvailable} open seats`} as of ${catalog.lastUpdated?.slice(0, 10) ?? 'the last refresh'}; ${section.seatsAvailable === 1 ? 'it' : 'they'} may already be gone.`,
    );
  }
  return issues;
}

/**
 * One note per term already under way (B, and F, from 10-19): adding a
 * section of it now is late and may need approval. Ended terms, other
 * years and placeholders have their own issues.
 */
function inProgressIssues(
  catalog: Catalog,
  entries: Map<number, CrnEntry>,
): ScheduleIssue[] {
  const current = currentAcademicYear(catalog);
  const dates = termDates(catalog, current);
  const now = today(catalog);
  if (!dates) return [];
  const byTerm = new Map<TermLetter, Section[]>();
  for (const [, entry] of entries) {
    const term = entry.section.computedTerm as TermLetter;
    const span = dates[term];
    if (yearOf(catalog, entry) !== current || entry.section.isInterestList) {
      continue;
    }
    if (!span || span.start > now || span.end < now) continue;
    byTerm.set(term, [...(byTerm.get(term) ?? []), entry.section]);
  }
  return [...byTerm].map(([term, sections]) => ({
    severity: 'warning',
    kind: 'inProgress',
    crns: sections.map(s => s.crn),
    message: `${term} term is in progress (started ${dates[term].start}): adding ${list(sections)} now is late and may need instructor or registrar approval.`,
  }));
}

function scheduleIssues(
  catalog: Catalog,
  entries: Map<number, CrnEntry>,
): ScheduleIssue[] {
  const byCourse = new Map<Course, Map<number, CrnEntry>>();
  for (const [crn, entry] of entries) {
    const course = entry.courses[0];
    if (!byCourse.has(course)) byCourse.set(course, new Map());
    byCourse.get(course)!.set(crn, entry);
  }
  const issues = [
    ...[...byCourse].flatMap(([course, chosen]) =>
      pairingIssues(course, chosen),
    ),
    ...[...entries].flatMap(([crn, entry]) =>
      statusIssues(catalog, crn, entry),
    ),
    ...inProgressIssues(catalog, entries),
  ];
  return [
    ...issues.filter(i => i.severity === 'error'),
    ...issues.filter(i => i.severity === 'warning'),
  ];
}
