// Building a DateTimeFormat costs far more than using one, and an ICS import
// converts thousands of instants, so keep one per zone.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

/** Milliseconds `timezone`'s wall clock runs ahead of UTC at `utcMs`. */
export function timezoneOffsetMs(utcMs: number, timezone: string): number {
  const parts = formatterFor(timezone).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find(p => p.type === type)?.value);
  const wallAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return wallAsUtc - utcMs;
}

/**
 * The UTC instant at which `timezone`'s wall clock reads `wallAsUtcMs`
 * (the wall components packed with Date.UTC). Throws RangeError for an
 * unknown zone.
 */
export function zonedWallToUtcMs(
  wallAsUtcMs: number,
  timezone: string,
): number {
  const offset = timezoneOffsetMs(wallAsUtcMs, timezone);
  let utcMs = wallAsUtcMs - offset;
  // Re-check at the corrected instant in case a DST change lies between.
  const corrected = timezoneOffsetMs(utcMs, timezone);
  if (corrected !== offset) utcMs = wallAsUtcMs - corrected;
  return utcMs;
}
