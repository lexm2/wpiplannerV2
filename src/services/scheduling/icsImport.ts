import ICAL from 'ical.js';
import { DayOfWeek } from '../../types/types';
import { formatLocalDate } from '../../utils/localDate';
import { timezoneOffsetMs, zonedWallToUtcMs } from '../../utils/timezone';
import { isPlannerCourseEvent } from '../../utils/plannerExportMarker';
import {
  detectWeeklyEvents,
  distinctTitles,
  type IcsImportResult,
  type IcsOccurrence,
  type ParsedCalendar,
  type TermWindow,
} from './weeklyEventDetection';

/**
 * ICS parsing on ical.js. Load this module with a dynamic import() so ical.js
 * stays out of the main bundle.
 */

/** Thrown for input that isn't a usable calendar; `message` is user-facing. */
export class IcsImportError extends Error {}

/** Most occurrences expanded per event before it counts as too dense. */
const MAX_ITERATIONS = 20_000;
const DAY_MS = 86_400_000;

const DAY_BY_INDEX: DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

/** Windows (Outlook) zone names to IANA, for files that omit the VTIMEZONE. */
const WINDOWS_ZONES: Record<string, string> = {
  'eastern standard time': 'America/New_York',
  'central standard time': 'America/Chicago',
  'mountain standard time': 'America/Denver',
  'us mountain standard time': 'America/Phoenix',
  'pacific standard time': 'America/Los_Angeles',
  'alaskan standard time': 'America/Anchorage',
  'hawaiian standard time': 'Pacific/Honolulu',
  'atlantic standard time': 'America/Halifax',
  'newfoundland standard time': 'America/St_Johns',
  'canada central standard time': 'America/Regina',
  'gmt standard time': 'Europe/London',
  'greenwich standard time': 'Atlantic/Reykjavik',
  'w. europe standard time': 'Europe/Berlin',
  'central europe standard time': 'Europe/Budapest',
  'romance standard time': 'Europe/Paris',
  'central european standard time': 'Europe/Warsaw',
  'e. europe standard time': 'Europe/Chisinau',
  'gtb standard time': 'Europe/Bucharest',
  'fle standard time': 'Europe/Kiev',
  'russian standard time': 'Europe/Moscow',
  'turkey standard time': 'Europe/Istanbul',
  'india standard time': 'Asia/Kolkata',
  'china standard time': 'Asia/Shanghai',
  'tokyo standard time': 'Asia/Tokyo',
  'korea standard time': 'Asia/Seoul',
  'singapore standard time': 'Asia/Singapore',
  'aus eastern standard time': 'Australia/Sydney',
  'new zealand standard time': 'Pacific/Auckland',
  utc: 'UTC',
};

const zoneCache = new Map<string, string | null>();

/** The IANA zone a TZID names, or null when it isn't one we can resolve. */
function resolveZoneName(tzid: string): string | null {
  const cached = zoneCache.get(tzid);
  if (cached !== undefined) return cached;
  const trimmed = tzid.trim().replace(/^"|"$/g, '');
  const candidates = [WINDOWS_ZONES[trimmed.toLowerCase()], trimmed];
  // Some exporters prefix a registry path ("/mozilla.org/20050126_1/America/New_York").
  if (trimmed.startsWith('/'))
    candidates.push(trimmed.split('/').slice(-2).join('/'));
  let found: string | null = null;
  for (const name of candidates) {
    if (!name) continue;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: name });
      found = name;
      break;
    } catch {
      // not an IANA name; try the next candidate
    }
  }
  zoneCache.set(tzid, found);
  return found;
}

interface Wall {
  date: string;
  day: DayOfWeek;
  minutes: number;
}

function wallFromUtcMs(utcMs: number, timezone: string): Wall {
  return wallFromComponents(
    new Date(utcMs + timezoneOffsetMs(utcMs, timezone)),
  );
}

/** `d` holds wall components in its UTC fields. */
function wallFromComponents(d: Date): Wall {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return {
    date: `${y}-${m}-${day}`,
    day: DAY_BY_INDEX[d.getUTCDay()],
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

/**
 * `time` as wall-clock time in `target`. Zone-resolved times (UTC, or a TZID the
 * file's VTIMEZONE defines) convert exactly. ical.js leaves a time floating
 * when its TZID has no VTIMEZONE, so `tzid` (the DTSTART parameter) is tried as
 * an IANA or Windows zone name; a truly floating time keeps its wall clock.
 */
function toWall(
  time: ICAL.Time,
  tzid: string | undefined,
  target: string,
): Wall {
  const floating = time.zone.tzid === 'floating';
  if (!floating) return wallFromUtcMs(time.toUnixTime() * 1000, target);
  const asUtc = Date.UTC(
    time.year,
    time.month - 1,
    time.day,
    time.hour,
    time.minute,
    time.second,
  );
  const source = tzid ? resolveZoneName(tzid) : null;
  if (source) {
    return wallFromUtcMs(zonedWallToUtcMs(asUtc, source), target);
  }
  return wallFromComponents(new Date(asUtc));
}

/** The calendar day after "YYYY-MM-DD". */
function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function dtstartTzid(component: ICAL.Component): string | undefined {
  const value = component.getFirstProperty('dtstart')?.getParameter('tzid');
  return typeof value === 'string' ? value : undefined;
}

function isCancelled(component: ICAL.Component): boolean {
  const status = component.getFirstPropertyValue('status');
  return typeof status === 'string' && status.toUpperCase() === 'CANCELLED';
}

const NOT_A_CALENDAR =
  "That file isn't a calendar (.ics) export. Export your calendar as .ics and try again.";

function toCalendars(parsed: unknown): ICAL.Component[] {
  const jcals: unknown[] =
    Array.isArray(parsed) && typeof parsed[0] === 'string'
      ? [parsed]
      : Array.isArray(parsed)
        ? parsed
        : [];
  return jcals
    .filter(j => Array.isArray(j) && j[0] === 'vcalendar')
    .map(j => new ICAL.Component(j as never));
}

/** The SUMMARY value of an (unfolded) VEVENT block, if it has a readable one. */
function summaryOfBlock(block: string[]): string {
  for (const line of block) {
    const m = /^SUMMARY(?:;[^:]*)?:(.*)$/i.exec(line);
    if (m) {
      const text = m[1]
        .replace(/\\([,;\\])/g, '$1')
        .replace(/\\n/gi, ' ')
        .trim();
      if (text) return text;
    }
  }
  return 'Untitled Event';
}

/**
 * Fallback for a file ical.js rejects as a whole: parse each VEVENT inside its
 * own VCALENDAR (header properties and every VTIMEZONE kept), so one bad event
 * only loses itself.
 */
function parseEventByEvent(source: string): {
  calendars: ICAL.Component[];
  unreadable: string[];
} {
  const lines = source
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
  const header: string[] = [];
  const zones: string[][] = [];
  const events: string[][] = [];
  let current: string[] | null = null;
  let kind = '';
  let depth = 0;
  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (current) {
      current.push(line);
      if (upper.startsWith('BEGIN:')) depth++;
      else if (upper.startsWith('END:')) {
        depth--;
        if (depth === 0) {
          (kind === 'VEVENT' ? events : zones).push(current);
          current = null;
        }
      }
    } else if (upper === 'BEGIN:VEVENT' || upper === 'BEGIN:VTIMEZONE') {
      current = [line];
      kind = upper.slice(6);
      depth = 1;
    } else if (
      upper &&
      !upper.startsWith('BEGIN:') &&
      !upper.startsWith('END:') &&
      zones.length === 0 &&
      events.length === 0
    ) {
      header.push(line);
    }
  }

  const wrap = (parts: string[][]): string =>
    ['BEGIN:VCALENDAR', ...header, ...parts.flat(), 'END:VCALENDAR'].join(
      '\r\n',
    );
  const calendars: ICAL.Component[] = [];
  const unreadable: string[] = [];
  for (const block of events) {
    let parsed: unknown = null;
    for (const attempt of [[...zones, block], [block]]) {
      try {
        parsed = ICAL.parse(wrap(attempt));
        break;
      } catch {
        // try without the time zones, then give up on this event
      }
    }
    const found = parsed ? toCalendars(parsed) : [];
    if (found.length > 0) calendars.push(...found);
    else unreadable.push(summaryOfBlock(block));
  }
  return { calendars, unreadable };
}

function parseCalendars(text: string): {
  calendars: ICAL.Component[];
  unreadable: string[];
} {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (!source.trim()) {
    throw new IcsImportError('That file is empty.');
  }
  if (!/BEGIN:VCALENDAR/i.test(source)) {
    throw new IcsImportError(NOT_A_CALENDAR);
  }
  let result: { calendars: ICAL.Component[]; unreadable: string[] };
  try {
    result = { calendars: toCalendars(ICAL.parse(source)), unreadable: [] };
  } catch {
    result = parseEventByEvent(source);
    if (result.calendars.length === 0) {
      throw new IcsImportError(
        "That calendar file couldn't be read. It may be damaged or not a real .ics file.",
      );
    }
  }
  if (result.calendars.length === 0) throw new IcsImportError(NOT_A_CALENDAR);
  return result;
}

interface EventGroup {
  master?: ICAL.Component;
  exceptions: ICAL.Component[];
}

/**
 * Every timed occurrence in `text` that falls inside `window` (dates
 * inclusive), converted to `timezone` wall-clock time.
 */
export function parseIcsOccurrences(
  text: string,
  window: { start: Date; end: Date },
  timezone: string = 'America/New_York',
): ParsedCalendar {
  const { calendars, unreadable } = parseCalendars(text);
  const startStr = formatLocalDate(window.start);
  const endStr = formatLocalDate(window.end);
  // Occurrences are expanded in order, so stop a day or two past the window
  // (time zones, and exceptions that move an instance earlier).
  const stopMs =
    Date.UTC(
      window.end.getFullYear(),
      window.end.getMonth(),
      window.end.getDate(),
    ) +
    3 * DAY_MS;
  const skipBeforeMs =
    Date.UTC(
      window.start.getFullYear(),
      window.start.getMonth(),
      window.start.getDate(),
    ) -
    3 * DAY_MS;

  const occurrences: IcsOccurrence[] = [];
  const dropped: ParsedCalendar['dropped'] = {
    allDay: 0,
    overnight: 0,
    cancelled: 0,
    tooDense: 0,
    outsideWindow: 0,
    unreadable: 0,
    noLength: 0,
    plannerExport: 0,
  };
  const titles = new Map<keyof ParsedCalendar['dropped'], string[]>();
  const drop = (reason: keyof ParsedCalendar['dropped'], title: string) => {
    dropped[reason]++;
    const list = titles.get(reason);
    if (list) list.push(title);
    else titles.set(reason, [title]);
  };
  for (const title of unreadable) drop('unreadable', title);
  const exportedUids = new Set<string>();
  let first: string | null = null;
  let last: string | null = null;
  const seen = (date: string): void => {
    if (first === null || date < first) first = date;
    if (last === null || date > last) last = date;
  };

  // Group VEVENTs by UID: the one without RECURRENCE-ID is the master.
  const groups = new Map<string, EventGroup>();
  let anonymous = 0;
  for (const calendar of calendars) {
    for (const vevent of calendar.getAllSubcomponents('vevent')) {
      const rawUid = vevent.getFirstPropertyValue('uid');
      const uid =
        typeof rawUid === 'string' && rawUid.trim()
          ? rawUid.trim()
          : `no-uid-${anonymous++}`;
      let group = groups.get(uid);
      if (!group) groups.set(uid, (group = { exceptions: [] }));
      if (vevent.hasProperty('recurrence-id')) group.exceptions.push(vevent);
      // A second copy of the same event (merged calendars, re-exports) adds
      // nothing, and relating it as an exception would throw.
      else if (!group.master) group.master = vevent;
    }
  }

  // Exceptions whose master isn't in the file (an export of only the changed
  // instances) each stand on their own.
  const units: {
    uid: string;
    master: ICAL.Component;
    exceptions: ICAL.Component[];
  }[] = [];
  for (const [uid, group] of groups) {
    if (group.master) {
      units.push({ uid, master: group.master, exceptions: group.exceptions });
    } else {
      for (const lone of group.exceptions) {
        // ical.js expands nothing for a component that still names the
        // instance it replaces, so read it as a plain one-off event.
        lone.removeAllProperties('recurrence-id');
        units.push({ uid, master: lone, exceptions: [] });
      }
    }
  }

  for (const { uid, master, exceptions } of units) {
    const rawTitle = master.getFirstPropertyValue('summary');
    const title =
      (typeof rawTitle === 'string' && rawTitle.trim()) || 'Untitled Event';
    try {
      const description = master.getFirstPropertyValue('description');
      const kind = master.getFirstPropertyValue('x-wpiplanner-kind');
      if (
        isPlannerCourseEvent({
          uid,
          description: typeof description === 'string' ? description : null,
          kind: typeof kind === 'string' ? kind : null,
        })
      ) {
        if (!exportedUids.has(uid)) {
          exportedUids.add(uid);
          drop('plannerExport', title);
        }
        continue;
      }
      const dtstart = master.getFirstPropertyValue('dtstart');
      if (!(dtstart instanceof ICAL.Time)) continue;
      const startWall = toWall(dtstart, dtstartTzid(master), timezone);
      seen(startWall.date);

      if (isCancelled(master)) {
        drop('cancelled', title);
        continue;
      }
      if (dtstart.isDate) {
        drop('allDay', title);
        continue;
      }

      const event = new ICAL.Event(master, { exceptions });
      const iterator = event.iterator();
      let inWindow = 0;
      let overnight = 0;
      let noLength = 0;
      let reachedEnd = false;
      const collected: IcsOccurrence[] = [];
      const location = event.location?.trim() || undefined;

      // The latest occurrence passed over before the window, for `span`.
      let lastSkipped: ICAL.Time | null = null;

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const next = iterator.next();
        if (!next) {
          reachedEnd = true;
          break;
        }
        const nextMs = next.toUnixTime() * 1000;
        if (nextMs > stopMs) {
          reachedEnd = true;
          break;
        }
        // Expansion starts at DTSTART, possibly years back; skip the time-zone
        // work for occurrences that can't land in the window.
        if (nextMs < skipBeforeMs) {
          lastSkipped = next;
          continue;
        }
        const details = event.getOccurrenceDetails(next);
        const item = details.item.component;
        if (item !== master && isCancelled(item)) continue;
        const tzid = dtstartTzid(item);
        const s = toWall(details.startDate, tzid, timezone);
        const e = toWall(details.endDate, tzid, timezone);
        seen(s.date);
        if (s.date < startStr || s.date > endStr) continue;
        inWindow++;
        let endMin = e.minutes;
        if (e.date !== s.date) {
          // Ending exactly at midnight is the end of the day, not overnight.
          if (e.minutes === 0 && e.date === nextDate(s.date)) endMin = 1439;
          else {
            overnight++;
            continue;
          }
        }
        if (endMin <= s.minutes) {
          noLength++;
          continue;
        }
        collected.push({
          uid,
          title,
          ...(location ? { location } : {}),
          date: s.date,
          day: s.day,
          startMin: s.minutes,
          endMin,
        });
      }

      if (lastSkipped) {
        seen(toWall(lastSkipped, dtstartTzid(master), timezone).date);
      }
      if (!reachedEnd) drop('tooDense', title);
      else if (collected.length > 0) occurrences.push(...collected);
      else if (inWindow === 0) drop('outsideWindow', title);
      else if (overnight + noLength === inWindow)
        drop(overnight > 0 ? 'overnight' : 'noLength', title);
    } catch {
      // One malformed event shouldn't sink the whole import; report it.
      drop('unreadable', title);
    }
  }

  return {
    occurrences,
    span: first !== null && last !== null ? { first, last } : null,
    dropped,
    droppedTitles: Object.fromEntries(
      [...titles].map(([reason, list]) => [reason, distinctTitles(list)]),
    ),
  };
}

/** Parse `text` and detect the weekly events of the given terms. */
export function importIcsText(
  text: string,
  terms: TermWindow[],
): IcsImportResult {
  if (terms.length === 0)
    return detectWeeklyEvents(
      parseIcsOccurrences(text, { start: new Date(), end: new Date() }),
      terms,
    );
  const start = terms.reduce(
    (min, t) => (t.start < min ? t.start : min),
    terms[0].start,
  );
  const end = terms.reduce(
    (max, t) => (t.end > max ? t.end : max),
    terms[0].end,
  );
  return detectWeeklyEvents(parseIcsOccurrences(text, { start, end }), terms);
}
