import {
  AcademicTerm,
  EventType,
  type LocalCalendarEvent,
} from '../../types/schedule';
import { DayOfWeek, type SimpleTime } from '../../types/types';
import { formatLocalDate } from '../../utils/localDate';

/**
 * Turns a calendar's expanded occurrences into the weekly events a term
 * schedule needs. Pure: no ical.js, no app state, so the 30% rule is testable
 * on plain occurrence lists.
 */

/** Share of a term's weeks an event must meet in to count as weekly there. */
export const WEEKLY_THRESHOLD = 0.3;

/** A quarter term's dates, both ends inclusive, as local midnights. */
export interface TermWindow {
  term: 'A' | 'B' | 'C' | 'D';
  start: Date;
  end: Date;
}

/** One meeting of a calendar event, on the planner's wall clock (America/New_York). */
export interface IcsOccurrence {
  /** The source VEVENT's UID (a synthesized one when the file has none). */
  uid: string;
  /** SUMMARY, trimmed; "Untitled Event" when empty. */
  title: string;
  location?: string;
  /** Local calendar day, "YYYY-MM-DD". */
  date: string;
  day: DayOfWeek;
  /** Minutes after midnight; endMin > startMin, same day. */
  startMin: number;
  endMin: number;
}

/** What the ICS parser hands the detector. */
export interface ParsedCalendar {
  /** Timed, same-day, not-cancelled occurrences inside the parse window. */
  occurrences: IcsOccurrence[];
  /** Earliest and latest event start in the file ("YYYY-MM-DD"), any year. */
  span: { first: string; last: string } | null;
  /** Events (by UID) left out before detection, by reason. */
  dropped: {
    allDay: number;
    overnight: number;
    cancelled: number;
    /** Recurrences too dense to expand (e.g. FREQ=MINUTELY). */
    tooDense: number;
    /** Timed events with no occurrence inside the parse window at all. */
    outsideWindow: number;
    /** Events ical.js couldn't read (e.g. a malformed RRULE). */
    unreadable: number;
    /** Timed events with no length (no DTEND/DURATION, or end == start). */
    noLength: number;
    /** Course meetings from this planner's own .ics export (`wpi-…@wpiplannerv2` UIDs). */
    plannerExport: number;
  };
  /** Distinct titles behind each `dropped` count. */
  droppedTitles: Partial<Record<keyof ParsedCalendar['dropped'], string[]>>;
}

/** Why an event in the file didn't become a candidate. */
export type SkipReason =
  | 'occasional'
  | 'weekend'
  | 'outsideTerms'
  | 'allDay'
  | 'overnight'
  | 'cancelled'
  | 'tooDense'
  | 'unreadable'
  | 'noLength'
  | 'plannerExport';

/** A weekly event found in the file, ready to become a LocalCalendarEvent. */
export interface WeeklyEventCandidate {
  /** Stable identity: normalized title, times, days and terms. */
  key: string;
  title: string;
  location?: string;
  /** Weekdays only (M-F), in week order. */
  days: DayOfWeek[];
  /** Quarter terms only, A-D order. */
  terms: AcademicTerm[];
  startTime: SimpleTime;
  endTime: SimpleTime;
  /** Per term: weeks it met / weeks it could have, on its least-covered day. */
  coverage: Partial<
    Record<TermWindow['term'], { met: number; possible: number }>
  >;
}

export interface IcsImportResult {
  candidates: WeeklyEventCandidate[];
  span: ParsedCalendar['span'];
  /**
   * Counts of source events (distinct UIDs) left out, by reason. `occasional`:
   * meet during the terms but never weekly enough. `weekend`: have qualifying
   * Saturday/Sunday meetings, which are left off (the event may still be a
   * candidate for its weekdays). `outsideTerms`: no meeting inside any of the
   * year's terms (includes the parser's `outsideWindow`).
   */
  skipped: Record<SkipReason, number>;
  /** Distinct titles behind each count, natural-sorted. */
  skippedTitles: Partial<Record<SkipReason, string[]>>;
}

const WEEKDAYS: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];
const WEEK_ORDER: DayOfWeek[] = [
  ...WEEKDAYS,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
];
const TERM_ORDER: TermWindow['term'][] = ['A', 'B', 'C', 'D'];

/**
 * The form titles are grouped and matched by: NFKC, every dash variant as "-",
 * curly quotes straight, whitespace collapsed, lowercase.
 */
function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Distinct (by normalized form) titles, natural-sorted. */
export function distinctTitles(titles: Iterable<string>): string[] {
  const byNorm = new Map<string, string>();
  for (const t of titles) {
    const norm = normalizeTitle(t);
    if (!byNorm.has(norm)) byNorm.set(norm, t.trim());
  }
  return [...byNorm.values()].sort(naturalCompare);
}

/** Threshold as an integer ratio, so `met / possible >= 0.3` has no float error. */
function ratioOf(threshold: number): { num: number; den: number } {
  return { num: Math.round(threshold * 1000), den: 1000 };
}

function mostFrequent(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | undefined;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

interface DayStat {
  met: number;
  possible: number;
}

export function detectWeeklyEvents(
  parsed: ParsedCalendar,
  terms: TermWindow[],
  threshold: number = WEEKLY_THRESHOLD,
): IcsImportResult {
  const { num, den } = ratioOf(threshold);
  const windows = terms
    .filter(t => TERM_ORDER.includes(t.term))
    .map(t => ({
      term: t.term,
      start: formatLocalDate(t.start),
      end: formatLocalDate(t.end),
    }));

  // Weeks each weekday could have met in, per term.
  const possible = new Map<string, number>();
  for (const w of windows) {
    const [sy, sm, sd] = w.start.split('-').map(Number);
    const [ey, em, ed] = w.end.split('-').map(Number);
    const endMs = Date.UTC(ey, em - 1, ed);
    for (let ms = Date.UTC(sy, sm - 1, sd); ms <= endMs; ms += 86_400_000) {
      const d = new Date(ms);
      const key = `${w.term}|${WEEK_ORDER[(d.getUTCDay() + 6) % 7]}`;
      possible.set(key, (possible.get(key) ?? 0) + 1);
    }
  }

  // Pattern = title, weekday, times, term; value = the distinct dates it met on.
  interface Pattern {
    norm: string;
    term: TermWindow['term'];
    day: DayOfWeek;
    startMin: number;
    endMin: number;
    dates: Set<string>;
    uids: Set<string>;
    locations: string[];
  }
  const patterns = new Map<string, Pattern>();
  const rawTitles = new Map<string, string[]>();
  const uidsInTerms = new Set<string>();
  const uidsAll = new Set<string>();
  const titleOfUid = new Map<string, string>();

  for (const occ of parsed.occurrences) {
    if (!titleOfUid.has(occ.uid)) titleOfUid.set(occ.uid, occ.title);
    const norm = normalizeTitle(occ.title);
    const raw = rawTitles.get(norm);
    if (raw) raw.push(occ.title);
    else rawTitles.set(norm, [occ.title]);
    uidsAll.add(occ.uid);

    const w = windows.find(t => occ.date >= t.start && occ.date <= t.end);
    if (!w) continue;
    uidsInTerms.add(occ.uid);
    const key = `${norm}|${w.term}|${occ.day}|${occ.startMin}|${occ.endMin}`;
    let p = patterns.get(key);
    if (!p) {
      p = {
        norm,
        term: w.term,
        day: occ.day,
        startMin: occ.startMin,
        endMin: occ.endMin,
        dates: new Set(),
        uids: new Set(),
        locations: [],
      };
      patterns.set(key, p);
    }
    p.dates.add(occ.date);
    p.uids.add(occ.uid);
    if (occ.location) p.locations.push(occ.location);
  }

  // Qualifying patterns, grouped per (title, times) then term.
  interface Group {
    norm: string;
    startMin: number;
    endMin: number;
    terms: Map<TermWindow['term'], Map<DayOfWeek, DayStat>>;
    locations: string[];
  }
  const groups = new Map<string, Group>();
  const candidateUids = new Set<string>();
  const weekendUids = new Set<string>();

  for (const p of patterns.values()) {
    const poss = possible.get(`${p.term}|${p.day}`) ?? 0;
    const met = p.dates.size;
    if (poss === 0 || met * den < poss * num) continue;
    if (p.day === DayOfWeek.SATURDAY || p.day === DayOfWeek.SUNDAY) {
      for (const u of p.uids) weekendUids.add(u);
      continue;
    }
    for (const u of p.uids) candidateUids.add(u);
    const gKey = `${p.norm}|${p.startMin}|${p.endMin}`;
    let g = groups.get(gKey);
    if (!g) {
      g = {
        norm: p.norm,
        startMin: p.startMin,
        endMin: p.endMin,
        terms: new Map(),
        locations: [],
      };
      groups.set(gKey, g);
    }
    let days = g.terms.get(p.term);
    if (!days) g.terms.set(p.term, (days = new Map<DayOfWeek, DayStat>()));
    days.set(p.day, { met, possible: poss });
    g.locations.push(...p.locations);
  }

  const candidates: WeeklyEventCandidate[] = [];
  for (const g of groups.values()) {
    const title = mostFrequent(rawTitles.get(g.norm) ?? []) ?? g.norm;
    const location = mostFrequent(g.locations);
    // Terms with identical weekday sets share a candidate.
    const bySignature = new Map<string, TermWindow['term'][]>();
    for (const term of TERM_ORDER) {
      const days = g.terms.get(term);
      if (!days) continue;
      const sig = WEEKDAYS.filter(d => days.has(d)).join('');
      const list = bySignature.get(sig);
      if (list) list.push(term);
      else bySignature.set(sig, [term]);
    }
    for (const [sig, sigTerms] of bySignature) {
      const days = sig.split('') as DayOfWeek[];
      const coverage: WeeklyEventCandidate['coverage'] = {};
      for (const term of sigTerms) {
        let worst: DayStat | undefined;
        for (const d of days) {
          const stat = g.terms.get(term)!.get(d)!;
          if (!worst || stat.met * worst.possible < worst.met * stat.possible) {
            worst = stat;
          }
        }
        coverage[term] = { ...worst! };
      }
      candidates.push({
        key: [g.norm, `${g.startMin}-${g.endMin}`, sig, sigTerms.join('')].join(
          '|',
        ),
        title,
        ...(location ? { location } : {}),
        days,
        terms: sigTerms as AcademicTerm[],
        startTime: {
          hours: Math.floor(g.startMin / 60),
          minutes: g.startMin % 60,
        },
        endTime: { hours: Math.floor(g.endMin / 60), minutes: g.endMin % 60 },
        coverage,
      });
    }
  }

  const startOf = (c: WeeklyEventCandidate) =>
    c.startTime.hours * 60 + c.startTime.minutes;
  candidates.sort(
    (a, b) =>
      naturalCompare(a.title, b.title) ||
      TERM_ORDER.indexOf(a.terms[0] as TermWindow['term']) -
        TERM_ORDER.indexOf(b.terms[0] as TermWindow['term']) ||
      startOf(a) - startOf(b),
  );

  const occasionalTitles: string[] = [];
  const weekendTitles: string[] = [];
  const betweenTitles: string[] = [];
  for (const uid of uidsAll) {
    const title = titleOfUid.get(uid) ?? '';
    if (weekendUids.has(uid)) weekendTitles.push(title);
    else if (candidateUids.has(uid)) continue;
    else if (uidsInTerms.has(uid)) occasionalTitles.push(title);
    else betweenTitles.push(title);
  }

  const { outsideWindow, ...dropped } = parsed.dropped;
  const skippedTitles: IcsImportResult['skippedTitles'] = {};
  const setTitles = (reason: SkipReason, titles: Iterable<string>) => {
    const list = distinctTitles(titles);
    if (list.length > 0) skippedTitles[reason] = list;
  };
  for (const [reason, titles] of Object.entries(parsed.droppedTitles)) {
    if (reason !== 'outsideWindow') setTitles(reason as SkipReason, titles);
  }
  setTitles('occasional', occasionalTitles);
  setTitles('weekend', weekendTitles);
  setTitles('outsideTerms', [
    ...(parsed.droppedTitles.outsideWindow ?? []),
    ...betweenTitles,
  ]);

  return {
    candidates,
    span: parsed.span,
    skipped: {
      ...dropped,
      occasional: occasionalTitles.length,
      weekend: weekendTitles.length,
      outsideTerms: outsideWindow + betweenTitles.length,
    },
    skippedTitles,
  };
}

/** Quarter terms an event's term list covers (F = A+B, S = C+D, ALL = A-D). */
function expandTerms(
  terms: readonly AcademicTerm[] | undefined,
): Set<TermWindow['term']> {
  const out = new Set<TermWindow['term']>();
  for (const t of terms ?? []) {
    if (t === AcademicTerm.ALL) TERM_ORDER.forEach(x => out.add(x));
    else if (t === AcademicTerm.F) ['A', 'B'].forEach(x => out.add(x as never));
    else if (t === AcademicTerm.S) ['C', 'D'].forEach(x => out.add(x as never));
    else out.add(t);
  }
  return out;
}

const minutesOf = (t: SimpleTime): number => t.hours * 60 + t.minutes;

/**
 * The parts of `candidate` not already on the schedule: its day x term cells
 * minus those covered by recurring `existing` events with the same normalized
 * title and the same start/end time. [] = fully covered; [candidate] (same
 * object) = nothing covered; otherwise the remaining cells regrouped into
 * candidates (terms with identical remaining day sets share one), each keeping
 * the coverage of its own terms.
 */
export function remainingAfterExisting(
  candidate: WeeklyEventCandidate,
  existing: readonly LocalCalendarEvent[],
): WeeklyEventCandidate[] {
  const norm = normalizeTitle(candidate.title);
  const start = minutesOf(candidate.startTime);
  const end = minutesOf(candidate.endTime);
  const covered = new Set<string>();
  for (const e of existing) {
    if (
      e.eventType !== EventType.RECURRING ||
      normalizeTitle(e.title) !== norm ||
      minutesOf(e.startTime) !== start ||
      minutesOf(e.endTime) !== end
    )
      continue;
    const days = new Set(e.days ?? []);
    for (const term of expandTerms(e.terms))
      for (const d of days) covered.add(`${term}|${d}`);
  }
  if (covered.size === 0) return [candidate];

  const candDays = WEEK_ORDER.filter(d => candidate.days.includes(d));
  const candTerms = TERM_ORDER.filter(t =>
    candidate.terms.includes(t as AcademicTerm),
  );
  let coveredAny = false;
  const bySignature = new Map<string, TermWindow['term'][]>();
  for (const term of candTerms) {
    const left = candDays.filter(d => !covered.has(`${term}|${d}`));
    if (left.length < candDays.length) coveredAny = true;
    if (left.length === 0) continue;
    const sig = left.join('');
    const list = bySignature.get(sig);
    if (list) list.push(term);
    else bySignature.set(sig, [term]);
  }
  if (!coveredAny) return [candidate];

  const result: WeeklyEventCandidate[] = [];
  for (const [sig, sigTerms] of bySignature) {
    const coverage: WeeklyEventCandidate['coverage'] = {};
    for (const t of sigTerms) {
      const c = candidate.coverage[t];
      if (c) coverage[t] = c;
    }
    result.push({
      ...candidate,
      key: [norm, `${start}-${end}`, sig, sigTerms.join('')].join('|'),
      days: sig.split('') as DayOfWeek[],
      terms: sigTerms as AcademicTerm[],
      coverage,
    });
  }
  return result;
}

const COURSE_CODE =
  /(?<![A-Za-z0-9])([A-Za-z]{2,4})[ -]?(\d{4})([A-Za-z]?)(?![A-Za-z0-9])/;

/**
 * The course code a title names, normalized ("CS 2102 Lecture" -> "CS2102",
 * "MA-1022" -> "MA1022", "ece2049x" -> "ECE2049X"), or null. Callers check
 * the code against the catalog; this only reads the text.
 */
export function courseCodeInTitle(title: string): string | null {
  const m = COURSE_CODE.exec(title.normalize('NFKC'));
  return m ? `${m[1]}${m[2]}${m[3]}`.toUpperCase() : null;
}
