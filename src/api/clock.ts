/** Clock times as the course API takes them: 24-hour "HH:MM". */
import * as z from 'zod';

export const ClockSchema = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'use 24-hour HH:MM, e.g. "09:30"');

/** An end time: any clock time, or "24:00" for the end of the day. */
export const EndClockSchema = z
  .string()
  .regex(
    /^(([01]?\d|2[0-3]):[0-5]\d|24:00)$/,
    'use 24-hour HH:MM, e.g. "17:00"; "24:00" is the end of the day',
  );

/** Minutes after midnight: "13:30" is 810. */
export function clockMinutes(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
}

/** "13:30" from 810. */
export function clockText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  return `${String(h).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
