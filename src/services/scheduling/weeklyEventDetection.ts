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
  };
}

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
  /** Counts of source events (distinct UIDs) left out, by reason. */
  skipped: Omit<ParsedCalendar['dropped'], 'outsideWindow'> & {
    /** Events that meet during the terms but never weekly enough. */
    occasional: number;
    /** Events that would qualify but only meet on Saturday/Sunday. */
    weekend: number;
    /** Events with no meeting inside any of the year's terms (includes `outsideWindow`). */
    outsideTerms: number;
  };
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

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
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

  for (const occ of parsed.occurrences) {
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
      a.title.toLowerCase().localeCompare(b.title.toLowerCase()) ||
      TERM_ORDER.indexOf(a.terms[0] as TermWindow['term']) -
        TERM_ORDER.indexOf(b.terms[0] as TermWindow['term']) ||
      startOf(a) - startOf(b),
  );

  let occasional = 0;
  let weekend = 0;
  let betweenTerms = 0;
  for (const uid of uidsAll) {
    if (candidateUids.has(uid)) continue;
    if (weekendUids.has(uid)) weekend++;
    else if (uidsInTerms.has(uid)) occasional++;
    else betweenTerms++;
  }

  const { outsideWindow, ...dropped } = parsed.dropped;
  return {
    candidates,
    span: parsed.span,
    skipped: {
      ...dropped,
      occasional,
      weekend,
      outsideTerms: outsideWindow + betweenTerms,
    },
  };
}

function normalizedSet<T>(values: readonly T[] | undefined): Set<T> {
  return new Set(values ?? []);
}

function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** Whether `existing` already covers `candidate` (same title, times, days, terms). */
export function matchesExistingEvent(
  candidate: WeeklyEventCandidate,
  existing: LocalCalendarEvent,
): boolean {
  return (
    existing.eventType === EventType.RECURRING &&
    normalizeTitle(existing.title) === normalizeTitle(candidate.title) &&
    existing.startTime.hours === candidate.startTime.hours &&
    existing.startTime.minutes === candidate.startTime.minutes &&
    existing.endTime.hours === candidate.endTime.hours &&
    existing.endTime.minutes === candidate.endTime.minutes &&
    sameSet(normalizedSet(existing.days), normalizedSet(candidate.days)) &&
    sameSet(normalizedSet(existing.terms), normalizedSet(candidate.terms))
  );
}
