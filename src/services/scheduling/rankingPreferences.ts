import * as z from 'zod';

export const IMPORTANCE_LEVELS = ['off', 'low', 'medium', 'high'] as const;
export type Importance = (typeof IMPORTANCE_LEVELS)[number];

export const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  off: 0,
  low: 1,
  medium: 3,
  high: 9,
};

const importance = (fallback: Importance, what: string) =>
  z
    .enum(IMPORTANCE_LEVELS)
    .default(fallback)
    .describe(
      `How much ${what} counts when ranking schedules: off, low, medium or high.`,
    );

const clock = (fallback: string, what: string) =>
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM, e.g. "09:00".')
    .default(fallback)
    .describe(what);

const minutes = (min: number, max: number, fallback: number, what: string) =>
  z.number().int().min(min).max(max).default(fallback).describe(what);

/**
 * Soft preferences that order the generated schedules. None of them rules a
 * schedule out; times are 24-hour "HH:MM", the same form the API uses for
 * busy blocks. Every field has a default, so a partial object parses.
 */
export const RankingPreferencesSchema = z.strictObject({
  earlyClasses: z
    .strictObject({
      importance: importance('off', 'avoiding early classes'),
      before: clock(
        '09:00',
        'Classes starting before this time count as early.',
      ),
    })
    .default({ importance: 'off', before: '09:00' })
    .describe('Avoid classes that start early in the day.'),
  lateClasses: z
    .strictObject({
      importance: importance('off', 'avoiding late classes'),
      after: clock('17:00', 'Classes ending after this time count as late.'),
    })
    .default({ importance: 'off', after: '17:00' })
    .describe('Avoid classes that run late in the day.'),
  gaps: z
    .strictObject({
      importance: importance('medium', 'the time between classes'),
      min: minutes(
        0,
        300,
        0,
        'Minutes wanted between consecutive classes. Classes start on the hour and run 50 minutes, so back-to-back is 10 and one free hour is 70.',
      ),
      max: minutes(
        0,
        300,
        0,
        'Minutes of idle time between classes that is acceptable; any more counts against a schedule. 10 allows back-to-back, 70 one free hour.',
      ),
    })
    .default({ importance: 'medium', min: 0, max: 0 })
    .describe('Time between consecutive classes on the same day.'),
  lunch: z
    .strictObject({
      importance: importance('off', 'a free lunch break'),
      from: clock('11:00', 'Start of the lunch window.'),
      to: clock('14:00', 'End of the lunch window.'),
      minutes: minutes(
        15,
        120,
        60,
        'Free minutes wanted somewhere inside the window. A free hour between classes is 70.',
      ),
    })
    .refine(l => l.to > l.from, {
      message: 'The lunch window must end after it starts.',
    })
    .default({ importance: 'off', from: '11:00', to: '14:00', minutes: 60 })
    .describe('Keep a free stretch for lunch on days with classes.'),
  fewerDays: z
    .strictObject({
      importance: importance('off', 'having classes on fewer days'),
    })
    .default({ importance: 'off' })
    .describe('Pack classes into as few days as possible.'),
  freeDays: z
    .strictObject({
      importance: importance('off', 'keeping the listed days free'),
      days: z
        .array(z.enum(['M', 'T', 'W', 'R', 'F', 'S', 'U']))
        .default(['F'])
        .describe('Days to keep class-free: M T W R F S U (R is Thursday).'),
    })
    .default({ importance: 'off', days: ['F'] })
    .describe('Keep chosen weekdays free of classes.'),
  termBalance: z
    .strictObject({
      importance: importance('high', 'an even load across terms'),
    })
    .default({ importance: 'high' })
    .describe('Aim for three courses in each term.'),
  openSeats: z
    .strictObject({
      importance: importance('off', 'avoiding full sections'),
    })
    .default({ importance: 'off' })
    .describe('Avoid sections that are full, closed or waitlisted.'),
  instructorRating: z
    .strictObject({
      importance: importance('off', 'well-rated instructors'),
    })
    .default({ importance: 'off' })
    .describe('Favor courses taught by better Rate My Professor ratings.'),
});

export type RankingPreferences = z.output<typeof RankingPreferencesSchema>;

export const DEFAULT_RANKING_PREFERENCES: RankingPreferences =
  RankingPreferencesSchema.parse({});

/**
 * Preferences from persisted or foreign data. Never throws: a malformed
 * criterion falls back to its default alone, so one bad field keeps the rest.
 */
export function normalizeRankingPreferences(raw: unknown): RankingPreferences {
  const source =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const prefs: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(RankingPreferencesSchema.shape)) {
    const parsed = schema.safeParse(source[key]);
    prefs[key] = parsed.success
      ? parsed.data
      : DEFAULT_RANKING_PREFERENCES[key as keyof RankingPreferences];
  }
  const result = prefs as RankingPreferences;
  const { gaps } = result;
  return gaps.min > gaps.max
    ? { ...result, gaps: { ...gaps, max: gaps.min } }
    : result;
}
