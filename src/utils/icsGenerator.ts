import ical, {
  ICalEventRepeatingFreq,
  ICalWeekday,
  ICalCalendarMethod,
} from 'ical-generator';
import { Schedule, SelectedCourse, EventType } from '../types/schedule';
import { Section, Period, DayOfWeek } from '../types/types';
import type { DateRange } from '../types/common';
import { TermBoundsService } from './termBounds';
import { getSelectedSections } from './courseUtils';
import { parseLocalDate } from './localDate';

type Quarter = 'A' | 'B' | 'C' | 'D';

/**
 * The quarters a term runs across, first to last. Semester sections (F/S) and
 * local events marked for the whole year span several, so their dates run
 * from the first quarter's start to the last one's end.
 */
const TERM_SPANS: Record<string, [Quarter, Quarter]> = {
  A: ['A', 'A'],
  B: ['B', 'B'],
  C: ['C', 'C'],
  D: ['D', 'D'],
  F: ['A', 'B'],
  S: ['C', 'D'],
  ALL: ['A', 'D'],
};

/** Milliseconds `timezone`'s wall clock runs ahead of UTC at `utcMs`. */
function timezoneOffsetMs(utcMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
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
 * The last second of `day` in `timezone`, formatted as an RRULE UNTIL in UTC.
 * RFC 5545 requires UNTIL in UTC when DTSTART carries a TZID; ical-generator
 * writes it as a floating local time instead, which some clients misread.
 */
function untilEndOfDay(day: Date, timezone: string): string {
  const wall = Date.UTC(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    23,
    59,
    59,
  );
  let utcMs: number;
  try {
    const offset = timezoneOffsetMs(wall, timezone);
    utcMs = wall - offset;
    // Re-check at the corrected instant in case a DST change lies between.
    const corrected = timezoneOffsetMs(utcMs, timezone);
    if (corrected !== offset) utcMs = wall - corrected;
  } catch {
    // Unknown timezone: fall back to the browser's own.
    utcMs = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      23,
      59,
      59,
    ).getTime();
  }
  return new Date(utcMs).toISOString().replace(/[-:]|\.\d{3}/g, '');
}

export interface ICSExportOptions {
  includeDescription?: boolean;
  includeProfessor?: boolean;
  timezone?: string;
}

export interface ICSExportResult {
  success: boolean;
  data?: string;
  skippedCourses: number;
  totalCourses: number;
  error?: string;
}

export class ICSGenerator {
  private static readonly DEFAULT_TIMEZONE = 'America/New_York';

  private static readonly DAY_TO_ICAL: Record<DayOfWeek, ICalWeekday> = {
    [DayOfWeek.MONDAY]: ICalWeekday.MO,
    [DayOfWeek.TUESDAY]: ICalWeekday.TU,
    [DayOfWeek.WEDNESDAY]: ICalWeekday.WE,
    [DayOfWeek.THURSDAY]: ICalWeekday.TH,
    [DayOfWeek.FRIDAY]: ICalWeekday.FR,
    [DayOfWeek.SATURDAY]: ICalWeekday.SA,
    [DayOfWeek.SUNDAY]: ICalWeekday.SU,
  };

  private static readonly DAY_TO_NUMBER: Record<DayOfWeek, number> = {
    [DayOfWeek.SUNDAY]: 0,
    [DayOfWeek.MONDAY]: 1,
    [DayOfWeek.TUESDAY]: 2,
    [DayOfWeek.WEDNESDAY]: 3,
    [DayOfWeek.THURSDAY]: 4,
    [DayOfWeek.FRIDAY]: 5,
    [DayOfWeek.SATURDAY]: 6,
  };

  static getTermDates(term: string, year: number): DateRange | null {
    const span = term ? TERM_SPANS[term.toUpperCase()] : undefined;
    if (!span) {
      return null;
    }

    const first = this.getQuarterDates(span[0], year);
    const last = this.getQuarterDates(span[1], year);
    if (!first || !last) {
      return null;
    }
    return { start: first.start, end: last.end };
  }

  private static getQuarterDates(
    quarter: Quarter,
    year: number,
  ): DateRange | null {
    const termBoundsService = TermBoundsService.getInstance();
    const boundsFromService = termBoundsService.getTermDates(quarter, year);

    if (boundsFromService) {
      return boundsFromService;
    }

    switch (quarter) {
      case 'A':
        return {
          start: new Date(year, 7, 21),
          end: new Date(year, 9, 10),
        };
      case 'B':
        return {
          start: new Date(year, 9, 20),
          end: new Date(year, 11, 12),
        };
      case 'C':
        return {
          start: new Date(year + 1, 0, 14),
          end: new Date(year + 1, 2, 6),
        };
      case 'D':
        return {
          start: new Date(year + 1, 2, 16),
          end: new Date(year + 1, 4, 6),
        };
      default:
        return null;
    }
  }

  private static createDateTime(
    baseDate: Date,
    hours: number,
    minutes: number,
  ): Date {
    const dt = new Date(baseDate);
    dt.setHours(hours, minutes, 0, 0);
    return dt;
  }

  /**
   * The earliest of `days` on or after `termStart`. An RRULE never produces
   * dates before DTSTART, so starting from any later meeting day would drop
   * the first week's earlier meetings.
   */
  static findFirstMeetingDate(
    termStart: Date,
    days: Iterable<DayOfWeek>,
  ): Date | null {
    let offset = Infinity;
    for (const day of days) {
      offset = Math.min(
        offset,
        (this.DAY_TO_NUMBER[day] - termStart.getDay() + 7) % 7,
      );
    }
    if (offset === Infinity) {
      return null;
    }

    const result = new Date(termStart);
    result.setDate(result.getDate() + offset);
    return result;
  }

  /** A weekly RRULE on `days` that runs through the whole of `termEnd`. */
  private static weeklyRule(
    days: Iterable<DayOfWeek>,
    termEnd: Date,
    timezone: string,
  ): string {
    const byDay = Array.from(days, day => this.DAY_TO_ICAL[day]).join(',');
    return `RRULE:FREQ=${ICalEventRepeatingFreq.WEEKLY};UNTIL=${untilEndOfDay(termEnd, timezone)};BYDAY=${byDay}`;
  }

  private static generateUID(
    course: SelectedCourse,
    section: Section,
    period: Period,
    periodIndex: number,
    startDate: Date,
  ): string {
    const courseId = `${course.course.departmentAbbr}${course.course.number}`;
    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const day = String(startDate.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    const periodType = period.type.toLowerCase().replace(/\s+/g, '-');
    // The index keeps two same-type periods starting the same day distinct.
    return `wpi-${courseId}-${section.number}-${periodType}-${periodIndex}-${dateStr}@wpiplannerv2`;
  }

  static generateICS(
    schedule: Schedule,
    options: ICSExportOptions = {},
  ): ICSExportResult {
    const timezone = options.timezone || this.DEFAULT_TIMEZONE;
    const service = TermBoundsService.getInstance();
    const academicYear =
      schedule.year ??
      service.getCurrentAcademicYear() ??
      new Date().getFullYear();

    const calendar = ical({
      name: schedule.name,
      timezone: timezone,
      prodId: '-//WPI Course Planner V2//EN',
      method: ICalCalendarMethod.PUBLISH,
    });

    let skippedCourses = 0;
    const totalCourses = schedule.selectedCourses.length;

    for (const selectedCourse of schedule.selectedCourses) {
      const componentsToExport = getSelectedSections(selectedCourse);

      if (componentsToExport.length === 0) {
        skippedCourses++;
        continue;
      }

      for (const section of componentsToExport) {
        const courseYear = selectedCourse.course.academicYear ?? academicYear;
        const termDates = this.getTermDates(section.computedTerm, courseYear);
        if (!termDates) {
          continue;
        }

        for (const [periodIndex, period] of section.periods.entries()) {
          const firstMeetingDate = this.findFirstMeetingDate(
            termDates.start,
            period.days,
          );
          if (!firstMeetingDate) {
            continue;
          }

          const startDateTime = this.createDateTime(
            firstMeetingDate,
            period.startTime.hours,
            period.startTime.minutes,
          );
          const endDateTime = this.createDateTime(
            firstMeetingDate,
            period.endTime.hours,
            period.endTime.minutes,
          );

          const uid = this.generateUID(
            selectedCourse,
            section,
            period,
            periodIndex,
            startDateTime,
          );

          const courseId = `${selectedCourse.course.departmentAbbr}-${selectedCourse.course.number}`;
          const periodTypePrefix =
            period.type.charAt(0).toUpperCase() + period.type.slice(1);
          const summary = `${periodTypePrefix}: ${courseId} ${selectedCourse.course.name}`;

          let description: string | undefined;
          if (options.includeDescription !== false) {
            const descParts: string[] = [];

            if (
              options.includeProfessor !== false &&
              period.instructors.length > 0
            ) {
              descParts.push(`Professor: ${period.instructors.join('; ')}`);
            }

            descParts.push(`CRN: ${section.crn}`);
            descParts.push(`Section: ${section.number}`);

            if (selectedCourse.course.description) {
              descParts.push('');
              descParts.push(selectedCourse.course.description);
            }

            description = descParts.join('\n');
          }

          const location =
            period.location ||
            (period.building && period.room
              ? `${period.building} ${period.room}`.trim()
              : undefined);

          calendar.createEvent({
            id: uid,
            start: startDateTime,
            end: endDateTime,
            summary: summary,
            description: description,
            location: location,
            timezone: timezone,
            repeating: this.weeklyRule(period.days, termDates.end, timezone),
          });
        }
      }
    }

    if (schedule.localEvents?.length) {
      for (const localEvent of schedule.localEvents) {
        if (!localEvent.visible) continue;

        if (localEvent.eventType === EventType.ONE_TIME) {
          if (!localEvent.date) continue;

          const eventDate = parseLocalDate(localEvent.date);
          const startDateTime = new Date(eventDate);
          startDateTime.setHours(
            localEvent.startTime.hours,
            localEvent.startTime.minutes,
            0,
            0,
          );

          const endDateTime = new Date(eventDate);
          endDateTime.setHours(
            localEvent.endTime.hours,
            localEvent.endTime.minutes,
            0,
            0,
          );

          const uid = `local-${localEvent.id}@wpiplannerv2`;

          calendar.createEvent({
            id: uid,
            start: startDateTime,
            end: endDateTime,
            summary: localEvent.title,
            description: localEvent.description || undefined,
            timezone: timezone,
          });
        } else {
          const terms = localEvent.terms || [];
          for (const term of terms) {
            const termDates = this.getTermDates(term, academicYear);
            if (!termDates) continue;

            const days = localEvent.days || [];
            const firstOccurrence = this.findFirstMeetingDate(
              termDates.start,
              days,
            );
            if (!firstOccurrence) continue;

            firstOccurrence.setHours(
              localEvent.startTime.hours,
              localEvent.startTime.minutes,
              0,
              0,
            );

            const endTime = new Date(firstOccurrence);
            endTime.setHours(
              localEvent.endTime.hours,
              localEvent.endTime.minutes,
              0,
              0,
            );

            const uid = `local-${localEvent.id}-${term}@wpiplannerv2`;

            calendar.createEvent({
              id: uid,
              start: firstOccurrence,
              end: endTime,
              summary: localEvent.title,
              description: localEvent.description || undefined,
              timezone: timezone,
              repeating: this.weeklyRule(days, termDates.end, timezone),
            });
          }
        }
      }
    }

    if (calendar.events().length === 0) {
      return {
        success: false,
        skippedCourses,
        totalCourses,
        error:
          skippedCourses > 0
            ? 'No courses with selected sections found'
            : 'No valid courses to export',
      };
    }

    return {
      success: true,
      data: calendar.toString(),
      skippedCourses,
      totalCourses,
    };
  }
}
