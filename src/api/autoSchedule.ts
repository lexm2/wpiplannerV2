/**
 * The auto-scheduler as the generate_schedules tool and POST /schedules
 * answer it: for the courses a student wants, whole schedules (a lecture
 * plus the labs and discussions that go with it, per course) that fit
 * around the sections and busy times they already have, best first by
 * their ranking preferences. Preferences only order the results; terms,
 * keepCrns, busy and openSeatsOnly are what rule sections out.
 */
import * as z from 'zod';
import type { Course } from '../types/types';
import { COMPONENT_KINDS, DayOfWeek } from '../types/types';
import type { SelectedCourse } from '../types/schedule';
import { SmartScheduler } from '../services/scheduling/SmartScheduler';
import type { ScheduleResult } from '../services/scheduling/AutoScheduler';
import {
  normalizeRankingPreferences,
  RankingPreferencesSchema,
} from '../services/scheduling/rankingPreferences';
import {
  slotsByQuarterDay,
  type ScoredSelection,
} from '../services/scheduling/ScheduleScorer';
import { TimeUtils } from '../utils/timeUtils';
import { isUncapped } from '../utils/seats';
import { QUARTERS, TERMS } from '../utils/typeGuards';
import { currentAcademicYear, type Catalog } from './catalog';
import {
  endedTerms,
  seatDataAge,
  termDates,
  yearLabel,
  type TermLetter,
} from './calendar';
import {
  BusyBlockSchema,
  MAX_CRNS,
  blockedSlotsForCrns,
  busyBlockSlots,
} from './conflicts';
import { clockText } from './clock';
import { ApiError, listSome } from './errors';
import {
  MAX_COURSE_INPUT,
  requireCourse,
  unpublishedYearError,
} from './lookup';
import { filterServiceFor, FallYearSchema, leaveOutEndedTerms } from './query';
import { caseless } from './schemaHints';
import {
  courseCode,
  toSectionBrief,
  type SectionBrief,
  type SectionKind,
} from './serialize';
import { plural } from './text';

const MAX_SCHEDULE_COURSES = 8;
const MAX_SCHEDULES = 10;
/** How many schedules the search collects before the best are shown. */
const SEARCH_CAP = 500;
/**
 * Longest a search runs: the server has no worker to time out, and a few
 * courses with hundreds of lab and discussion choices take seconds.
 */
const SEARCH_BUDGET_MS = 1000;

const CourseRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_COURSE_INPUT)
  .describe(
    'A course code ("CS 2102", "CS2102"), catalog id ("CS-2102-2026"), a section CRN, or a course title, as get_course takes.',
  );

export const AutoScheduleInputSchema = z
  .object({
    courses: z
      .array(
        z.union([
          CourseRefSchema,
          z
            .object({
              course: CourseRefSchema,
              terms: z
                .array(caseless(TERMS))
                .min(1)
                .optional()
                .describe(
                  'Only schedule this course in these terms (A, B, C, D, F, S).',
                ),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(MAX_SCHEDULE_COURSES)
      .describe(
        `The courses to schedule, 1-${MAX_SCHEDULE_COURSES}. Each is a course reference, or {course, terms} to allow only some terms for that course. One lecture, with its lab and discussion where the course has them, is chosen for each.`,
      ),
    year: FallYearSchema.optional().describe(
      'Academic year by its fall year (2026 = 2026-27). Omitted: the current year. A year whose schedule is not published is an error.',
    ),
    keepCrns: z
      .array(z.number().int().positive())
      .max(MAX_CRNS)
      .optional()
      .describe(
        'CRNs the student already has (or must keep): generated sections never overlap them. A CRN of a course being scheduled is an error.',
      ),
    busy: z
      .array(BusyBlockSchema)
      .max(20)
      .optional()
      .describe(
        'Weekly times the student is busy (a job, practice), every term: no section meets during one.',
      ),
    openSeatsOnly: z
      .boolean()
      .default(false)
      .describe(
        'Leave out sections with no open seat. Default false: full sections may appear (ranked lower only if preferences.openSeats is on).',
      ),
    includeEndedTerms: z
      .boolean()
      .default(false)
      .describe(
        'Also consider terms that have already ended. Default false: they are left out.',
      ),
    preferences: RankingPreferencesSchema.optional().describe(
      'Soft preferences that order the schedules, best first. They never rule a schedule out. Every field is optional: give only the ones that matter (e.g. {earlyClasses: {importance: "high", before: "10:00"}}); the defaults balance terms and minimise idle time between classes.',
    ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_SCHEDULES)
      .default(3)
      .describe(`How many schedules to return, 1-${MAX_SCHEDULES}.`),
  })
  .strict();

export type AutoScheduleInput = z.output<typeof AutoScheduleInputSchema>;

interface ScheduledSection extends SectionBrief {
  /** No seat cap (a team or ensemble): `seats` is a placeholder. */
  uncapped: boolean;
}

interface QuarterSummary {
  quarter: string;
  /** Weekdays with a class, in week order. */
  days: string[];
  /** The earliest start and latest end over those days, "HH:MM". */
  earliestStart: string;
  latestEnd: string;
  /** Minutes between consecutive classes of a day, summed over the days. */
  idleMinutes: number;
}

export interface GeneratedSchedule {
  /** 1 is the best. */
  rank: number;
  /** Every section, ready for check_conflicts and registration. */
  crns: number[];
  courses: {
    code: string;
    name: string;
    sections: ScheduledSection[];
  }[];
  quarters: QuarterSummary[];
}

export interface ScheduleSet {
  year: number;
  found: {
    count: number;
    /** The search stopped at its cap, so better schedules may exist. */
    capped: boolean;
    /** The search ran out of time, so better schedules may exist. */
    cutShort: boolean;
  };
  schedules: GeneratedSchedule[];
  /** Courses with no usable section; empty when every course has one. */
  unschedulable: { code: string; name: string }[];
  preferences: z.output<typeof RankingPreferencesSchema>;
  notices: string[];
  dataAsOf: string | null;
  dataAgeDays: number | null;
}

interface Requested {
  course: Course;
  terms?: string[];
}

function requestedCourses(
  catalog: Catalog,
  input: AutoScheduleInput,
  year: number,
  notices: string[],
): Requested[] {
  const requested: Requested[] = [];
  for (const entry of input.courses) {
    const ref = typeof entry === 'string' ? { course: entry } : entry;
    const { course, notices: how } = requireCourse(catalog, ref.course, year);
    notices.push(...how);
    // A catalog id names its own year, whatever year was asked for.
    if (course.academicYear !== year) {
      throw new ApiError(
        `${courseCode(course)} here is the ${course.academicYear === undefined ? 'undated' : yearLabel(course.academicYear)} offering, not ${yearLabel(year)}. Give the course code, or leave out year.`,
        400,
      );
    }
    if (requested.some(r => r.course === course)) {
      throw new ApiError(
        `${courseCode(course)} is listed twice in courses.`,
        400,
      );
    }
    requested.push({ course, terms: ref.terms });
  }
  return requested;
}

/** The kept CRNs' slots, refusing a CRN that is a section of a requested course. */
function keptSlots(
  catalog: Catalog,
  keepCrns: number[],
  year: number,
  requested: Requested[],
  notices: string[],
) {
  const { slots, otherYear } = blockedSlotsForCrns(catalog, keepCrns, year);
  for (const crn of keepCrns) {
    const entry = catalog.sectionsByCrn.get(crn);
    const own = entry?.courses.find(c =>
      requested.some(r => r.course.id === c.id),
    );
    if (own) {
      throw new ApiError(
        `keepCrns has CRN ${crn}, a section of ${courseCode(own)}, which courses asks to schedule. Leave it out of keepCrns to have a section chosen, or out of courses to keep it.`,
        400,
        { crn },
      );
    }
  }
  if (otherYear.length) {
    notices.push(
      `keepCrns ignores CRN ${listSome(otherYear)}: not ${yearLabel(year)} sections, so they cannot clash with the ones scheduled.`,
    );
  }
  return slots;
}

const termOf = (result: ScheduleResult): string =>
  (result.combination.lecture ?? result.combination.lab)!.computedTerm;

/** A quarter's days with class, span and idle time, from the chosen sections. */
function quarterSummaries(selections: ScoredSelection[]): QuarterSummary[] {
  const byQuarter = new Map<string, QuarterSummary & { dayNames: string[] }>();
  for (const { quarter, day, slots } of slotsByQuarterDay(
    selections,
  ).values()) {
    slots.sort((a, b) => a.start - b.start);
    let summary = byQuarter.get(quarter);
    if (!summary) {
      summary = {
        quarter,
        days: [],
        dayNames: [],
        earliestStart: '',
        latestEnd: '',
        idleMinutes: 0,
      };
      byQuarter.set(quarter, summary);
    }
    const start = slots[0].start;
    const end = Math.max(...slots.map(s => s.end));
    summary.dayNames.push(day);
    if (!summary.earliestStart || clockText(start) < summary.earliestStart) {
      summary.earliestStart = clockText(start);
    }
    if (!summary.latestEnd || clockText(end) > summary.latestEnd) {
      summary.latestEnd = clockText(end);
    }
    for (let i = 1; i < slots.length; i++) {
      summary.idleMinutes += Math.max(0, slots[i].start - slots[i - 1].end);
    }
  }
  return QUARTERS.filter(q => byQuarter.has(q)).map(q => {
    const { dayNames, ...summary } = byQuarter.get(q)!;
    const days = TimeUtils.DAYS_ORDER.filter(d => dayNames.includes(d));
    return { ...summary, days };
  });
}

function toGenerated(
  catalog: Catalog,
  year: number,
  rank: number,
  schedule: ScheduleResult[],
  order: Course[],
): GeneratedSchedule {
  const dates = termDates(catalog, year);
  const courses = [...schedule]
    .sort((a, b) => order.indexOf(a.course) - order.indexOf(b.course))
    .map(({ course, combination }) => ({
      code: courseCode(course),
      name: course.name,
      sections: COMPONENT_KINDS.flatMap(component => {
        const section = combination[component];
        if (!section) return [];
        // A course with no lecture is a standalone lab.
        const kind: SectionKind =
          component === 'lab' && !combination.lecture
            ? 'standaloneLab'
            : component;
        return [
          {
            ...toSectionBrief(
              section,
              kind,
              catalog.rmp,
              dates?.[section.computedTerm as TermLetter],
            ),
            uncapped: isUncapped(section),
          },
        ];
      }),
    }));
  const selections = schedule.map(r => ({
    combination: r.combination,
    term: termOf(r),
  }));
  return {
    rank,
    crns: courses.flatMap(c => c.sections.map(s => s.crn)),
    courses,
    quarters: quarterSummaries(selections),
  };
}

/** The likely reasons a request left a course (or every combination) nothing. */
function causes(input: AutoScheduleInput, ended: string[]): string {
  const list = [
    input.busy?.length && 'the busy blocks',
    input.keepCrns?.length && 'the sections in keepCrns',
    input.openSeatsOnly && 'openSeatsOnly (full sections are left out)',
    input.courses.some(c => typeof c !== 'string' && c.terms) &&
      'a terms list that names terms the course is not offered in',
    ended.length &&
      `ended terms (${ended.join(', ')}) being left out; includeEndedTerms: true allows them`,
    'a course with no timed sections',
  ].filter(Boolean);
  return list.join(', ');
}

export function generateSchedules(
  catalog: Catalog,
  input: AutoScheduleInput,
): ScheduleSet {
  const current = currentAcademicYear(catalog);
  const year = input.year ?? current;
  const unpublished = unpublishedYearError(catalog, year);
  if (unpublished) throw unpublished;

  const notices: string[] = [];
  const requested = requestedCourses(catalog, input, year, notices);
  const blockedSlots = [
    ...keptSlots(catalog, input.keepCrns ?? [], year, requested, notices),
    ...busyBlockSlots(input.busy ?? []),
  ];
  if (
    input.busy?.some(b =>
      b.days.some(d => d === DayOfWeek.SATURDAY || d === DayOfWeek.SUNDAY),
    )
  ) {
    notices.push(
      'Busy blocks on Saturday or Sunday are not applied: sections are fitted Monday to Friday.',
    );
  }

  // The same criteria a search builds: conflicts with what the student has,
  // and no sections of terms that have ended.
  const criteria = new Map<string, unknown>();
  criteria.set('periodConflict', {
    avoidConflicts: true,
    blockedSlots,
    semesterSpansQuarters: true,
  });
  const ended = year === current ? endedTerms(catalog, current) : [];
  if (ended.length && !input.includeEndedTerms) {
    const left = leaveOutEndedTerms(year, current, ended);
    criteria.set(left.id, left.criteria);
    notices.push(left.notice);
  }
  if (input.openSeatsOnly)
    criteria.set('availability', { availableOnly: true });

  const selected: SelectedCourse[] = requested.map(({ course, terms }) => ({
    course,
    selected: {},
    isRequired: true,
    lockedSections: new Set(),
    allowedTerms: terms,
  }));
  // Parsed already; this fills the defaults and lifts a gaps.max below min.
  const preferences = normalizeRankingPreferences(input.preferences);
  const scheduler = new SmartScheduler(filterServiceFor(catalog, criteria));
  const candidates = scheduler.buildCandidateData(
    selected,
    preferences,
    catalog.rmp,
  );

  const base = {
    year,
    preferences,
    notices,
    dataAsOf: catalog.lastUpdated,
    dataAgeDays: seatDataAge(catalog),
  };
  if (!candidates.ok) {
    const names = candidates.unschedulable.map(c => courseCode(c));
    notices.push(
      `No schedule: ${names.join(', ')} ${names.length === 1 ? 'has' : 'have'} no section that can be scheduled. Likely causes: ${causes(input, ended)}.`,
    );
    return {
      ...base,
      found: { count: 0, capped: false, cutShort: false },
      schedules: [],
      unschedulable: candidates.unschedulable.map(c => ({
        code: courseCode(c),
        name: c.name,
      })),
    };
  }

  const { schedules: found, cutShort } = SmartScheduler.findSchedulesBefore(
    candidates.input,
    SEARCH_CAP,
    performance.now() + SEARCH_BUDGET_MS,
  );
  // Time first: a search that ran out before finishing one schedule has not
  // shown that everything clashes.
  if (cutShort && found.length === 0) {
    notices.push(
      `No schedule yet: the search ran out of time (${SEARCH_BUDGET_MS / 1000} second) before finishing one, so this says nothing about whether one fits. Give fewer courses, or terms for the courses with many lab and discussion choices.`,
    );
  } else if (found.length === 0) {
    notices.push(
      `No schedule: every combination of the courses' sections clashes, with each other or with what is blocked. Likely causes: ${causes(input, ended)}. Try fewer courses, or more terms.`,
    );
  } else if (cutShort) {
    notices.push(
      `The search was cut short after ${SEARCH_BUDGET_MS / 1000} second: these are the best of the ${plural(found.length, 'schedule')} found so far, and better ones may exist. Fewer courses, or terms for the courses with many lab and discussion choices, make it complete.`,
    );
  } else if (found.length >= SEARCH_CAP) {
    notices.push(
      `The search stopped after ${plural(SEARCH_CAP, 'schedule')}; the best of those are shown, and a better one may exist.`,
    );
  }
  const order = requested.map(r => r.course);
  return {
    ...base,
    found: {
      count: found.length,
      capped: found.length >= SEARCH_CAP,
      cutShort,
    },
    schedules: found
      .slice(0, input.limit)
      .map((schedule, i) => toGenerated(catalog, year, i + 1, schedule, order)),
    unschedulable: [],
  };
}
