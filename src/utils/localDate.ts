/**
 * Date-only strings ("YYYY-MM-DD") read and written as local calendar days.
 *
 * `new Date('2026-08-20')` parses as UTC midnight, which is the previous
 * evening anywhere west of Greenwich, and `toISOString()` reports the UTC day,
 * which is tomorrow after ~8pm in US Eastern. These keep the day the user sees.
 */

/** Local midnight on the given "YYYY-MM-DD" day. */
export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** The local calendar day of `date` as "YYYY-MM-DD". */
export function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
