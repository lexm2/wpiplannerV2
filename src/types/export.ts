/**
 * Compact local export/import format (v4.x).
 * Keys are abbreviated to minimize size.
 *
 * 4.3 files carry names, course picks and the year only; 4.4 adds a per-schedule
 * extras object (calendar events, and each course's required flag, locked
 * sections, colour and allowed terms). Both import: every v4.x field after the
 * first three is optional.
 */
import * as z from 'zod';
import { EventType, type LocalCalendarEvent, type Schedule } from './schedule';
import { DayOfWeek } from './types';

/** What one course carries beyond its section picks; absent when default. */
interface CourseExtras {
  /** Required course (the auto-scheduler must include it). */
  r?: true;
  /** Locked section ids. */
  l?: string[];
  /** Custom colour. */
  c?: string;
  /** Allowed terms. */
  t?: string[];
}

export interface ScheduleExtras {
  /** Calendar events. */
  e?: LocalCalendarEvent[];
  /** Per-course extras, by course id. */
  x?: Record<string, CourseExtras>;
}

export interface ExportData {
  v: string;
  a: number | null;
  s: [string, (string | null)[], (number | null)?, ScheduleExtras?][];
  p?: {
    t: [number, number];
    d: number[];
    th?: string;
  };
}

const SimpleTimeSchema = z.object({ hours: z.number(), minutes: z.number() });

/**
 * A calendar event as a file or storage row carries it. Loose, so a field a
 * newer build adds survives; the booleans and timestamps default rather than
 * reject, since an event missing them is still a usable busy block.
 */
export const LocalEventSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  eventType: z.enum(EventType),
  description: z.string().optional().catch(undefined),
  date: z.string().optional().catch(undefined),
  days: z.array(z.enum(DayOfWeek)).optional().catch(undefined),
  startTime: SimpleTimeSchema,
  endTime: SimpleTimeSchema,
  terms: z.array(z.string()).optional().catch(undefined),
  visible: z.boolean().catch(true),
  createdAt: z.number().catch(0),
  updatedAt: z.number().catch(0),
});

const CourseExtrasSchema = z.object({
  r: z.literal(true).optional(),
  l: z.array(z.string()).optional(),
  c: z.string().optional(),
  t: z.array(z.string()).optional(),
});

const ScheduleExtrasSchema = z.object({
  // Parsed one by one by the importer, so one bad event costs only itself.
  e: z.array(z.unknown()).optional(),
  x: z.record(z.string(), CourseExtrasSchema).optional(),
});

/**
 * Untrusted input: users paste files they exported earlier, possibly from an
 * older build. The `v` check is left to callers so a well-formed but outdated
 * file can get "please re-export" rather than a schema error.
 */
export const ExportDataSchema = z.object({
  v: z.string(),
  a: z.number().nullable(),
  s: z.array(
    z.tuple([
      z.string(),
      z.array(z.string().nullable()),
      z.number().nullish(),
      ScheduleExtrasSchema.optional(),
    ]),
  ),
  p: z
    .object({
      t: z.tuple([z.number(), z.number()]),
      d: z.array(z.number()),
      th: z.string().optional(),
    })
    .optional(),
});

export type ParsedExportData = z.infer<typeof ExportDataSchema>;

/** Parsed events, with the ones that are not events dropped. */
export function parseExportedEvents(events: unknown[]): LocalCalendarEvent[] {
  const kept: LocalCalendarEvent[] = [];
  for (const event of events) {
    const parsed = LocalEventSchema.safeParse(event);
    if (parsed.success) kept.push(parsed.data as LocalCalendarEvent);
  }
  return kept;
}

/** The extras for `schedule`, or undefined when it has none to carry. */
export function extrasOf(schedule: Schedule): ScheduleExtras | undefined {
  const x: Record<string, CourseExtras> = {};
  for (const sc of schedule.selectedCourses) {
    const extras: CourseExtras = {};
    if (sc.isRequired) extras.r = true;
    if (sc.lockedSections.size > 0) extras.l = [...sc.lockedSections];
    if (sc.customColor) extras.c = sc.customColor;
    if (sc.allowedTerms?.length) extras.t = sc.allowedTerms;
    if (Object.keys(extras).length > 0) x[sc.course.id] = extras;
  }
  const extras: ScheduleExtras = {};
  if (schedule.localEvents?.length) extras.e = schedule.localEvents;
  if (Object.keys(x).length > 0) extras.x = x;
  return Object.keys(extras).length > 0 ? extras : undefined;
}
