/**
 * Validation for everything read back from browser storage.
 *
 * Stored data is untrusted: a row can come from an older or newer build, be
 * hand-edited, or be cut short. Shape problems are caught here, at the
 * boundary, so code downstream can rely on the types. One unreadable schedule
 * is skipped rather than failing the others, and a piece inside a schedule
 * (one course, one event) is dropped rather than the whole schedule.
 */
import * as z from 'zod';
import type { Schedule, SchedulePreferences } from '../../types/schedule';
import { LocalEventSchema } from '../../types/export';

/** Thrown for a row that cannot be turned into a schedule. */
export class UnreadableScheduleError extends Error {}

export interface ValidatedSchedule {
  schedule: Schedule;
  /** Courses and events inside the schedule that had to be dropped. */
  dropped: number;
}

// Loose throughout: only what the app dereferences without a guard is
// checked. Course and Section trees are the catalog's shape and are
// reconciled against the live catalog later (resolveCourseReferences).
const StoredCourseSchema = z.looseObject({
  course: z.looseObject({ id: z.string() }),
  selected: z.record(z.string(), z.unknown()).catch({}),
  isRequired: z.boolean().catch(false),
  lockedSections: z
    .preprocess(
      value => (Array.isArray(value) ? new Set(value) : value),
      z.instanceof(Set),
    )
    .catch(new Set()),
});

const StoredScheduleSchema = z.looseObject({
  name: z.string().catch('Untitled schedule'),
  selectedCourses: z.array(z.unknown()),
  generatedSchedules: z.array(z.unknown()).catch([]),
  localEvents: z.array(z.unknown()).optional().catch(undefined),
  year: z.number().optional().catch(undefined),
});

/** The items of `items` that pass `schema`, and how many did not. */
function keepValid<T extends z.ZodType>(
  items: unknown[],
  schema: T,
): { kept: z.output<T>[]; dropped: number } {
  const kept: z.output<T>[] = [];
  for (const item of items) {
    const parsed = schema.safeParse(item);
    if (parsed.success) kept.push(parsed.data);
  }
  return { kept, dropped: items.length - kept.length };
}

/**
 * Checks a decoded (and migrated) schedule. `rowId` is the store key, which
 * stands in for an `id` the payload lost.
 */
export function validateStoredSchedule(
  raw: unknown,
  rowId: string,
): ValidatedSchedule {
  const parsed = StoredScheduleSchema.safeParse(raw);
  if (!parsed.success) {
    throw new UnreadableScheduleError(z.prettifyError(parsed.error));
  }
  const { selectedCourses, localEvents, ...rest } = parsed.data;
  const courses = keepValid(selectedCourses, StoredCourseSchema);
  const events = keepValid(localEvents ?? [], LocalEventSchema);

  const stored = raw as { id?: unknown };
  const id =
    typeof stored.id === 'string' && stored.id.length > 0 ? stored.id : rowId;
  const schedule = {
    ...rest,
    id,
    selectedCourses: courses.kept,
    ...(localEvents && { localEvents: events.kept }),
  } as unknown as Schedule;
  return { schedule, dropped: courses.dropped + events.dropped };
}

const StoredPreferencesSchema = z.looseObject({
  theme: z.string().optional().catch(undefined),
  bookmarkedCourseIds: z.array(z.string()).catch([]),
  avoidCalendarEvents: z.boolean().optional().catch(undefined),
});

/** Preferences with any wrongly-typed field dropped; null if not an object. */
export function validateStoredPreferences(
  raw: unknown,
): SchedulePreferences | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const parsed = StoredPreferencesSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
