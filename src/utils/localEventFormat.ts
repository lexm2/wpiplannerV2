import { EventType, type LocalCalendarEvent } from '../types/schedule';
import { DayOfWeek, type SimpleTime } from '../types/types';
import { TimeUtils } from './timeUtils';

/** Three-letter weekday names, for lists of days ("Mon, Wed"). */
const DAY_NAMES: Record<DayOfWeek, string> = {
  [DayOfWeek.MONDAY]: 'Mon',
  [DayOfWeek.TUESDAY]: 'Tue',
  [DayOfWeek.WEDNESDAY]: 'Wed',
  [DayOfWeek.THURSDAY]: 'Thu',
  [DayOfWeek.FRIDAY]: 'Fri',
  [DayOfWeek.SATURDAY]: 'Sat',
  [DayOfWeek.SUNDAY]: 'Sun',
};

const WEEK_ORDER = Object.keys(DAY_NAMES) as DayOfWeek[];

export function daysLabel(days: readonly DayOfWeek[] | undefined): string {
  return [...(days ?? [])]
    .sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b))
    .map(d => DAY_NAMES[d] ?? d)
    .join(', ');
}

export function timeRangeLabel(start: SimpleTime, end: SimpleTime): string {
  return TimeUtils.formatTimeRange(
    { hours: start.hours, minutes: start.minutes, displayTime: '' },
    { hours: end.hours, minutes: end.minutes, displayTime: '' },
  );
}

/** "Wed, Nov 11, 2026" from an ISO "YYYY-MM-DD" date. */
function dateLabel(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "Mon, Wed" for a recurring event, the date for a one-time one. */
export function whenLabel(event: LocalCalendarEvent): string {
  return event.eventType === EventType.ONE_TIME
    ? dateLabel(event.date)
    : daysLabel(event.days);
}

/** `"Work Shift" (Mon, Wed 9:00–11:00 AM · A, B)`: names exactly what a delete removes. */
export function describeEvent(event: LocalCalendarEvent): string {
  const time = timeRangeLabel(event.startTime, event.endTime).replace('-', '–');
  const terms = event.terms?.length ? ` · ${event.terms.join(', ')}` : '';
  return `"${event.title || 'Untitled Event'}" (${whenLabel(event)} ${time}${terms})`;
}

const collator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

function startMinutes(e: LocalCalendarEvent): number {
  return e.startTime.hours * 60 + e.startTime.minutes;
}

/** Recurring events first (title, then start time), then one-time ones by date. */
export function sortEvents(
  events: readonly LocalCalendarEvent[],
): LocalCalendarEvent[] {
  const recurring = events.filter(e => e.eventType !== EventType.ONE_TIME);
  const oneTime = events.filter(e => e.eventType === EventType.ONE_TIME);
  recurring.sort(
    (a, b) =>
      collator.compare(a.title, b.title) || startMinutes(a) - startMinutes(b),
  );
  oneTime.sort(
    (a, b) =>
      (a.date ?? '').localeCompare(b.date ?? '') ||
      startMinutes(a) - startMinutes(b) ||
      collator.compare(a.title, b.title),
  );
  return [...recurring, ...oneTime];
}
