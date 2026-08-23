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

  private static getTermDates(term: string, year: number): DateRange | null {
    if (!term || term === 'TBA') {
      return null;
    }

    const termLetter = term.charAt(0).toUpperCase() as 'A' | 'B' | 'C' | 'D';

    const termBoundsService = TermBoundsService.getInstance();
    const boundsFromService = termBoundsService.getTermDates(termLetter, year);

    if (boundsFromService) {
      return boundsFromService;
    }

    switch (termLetter) {
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

  private static findNextDayOfWeek(
    startDate: Date,
    targetDay: DayOfWeek,
  ): Date {
    const targetDayNum = this.DAY_TO_NUMBER[targetDay];
    const currentDayNum = startDate.getDay();
    let daysToAdd = targetDayNum - currentDayNum;

    if (daysToAdd < 0) {
      daysToAdd += 7;
    }

    const result = new Date(startDate);
    result.setDate(result.getDate() + daysToAdd);
    return result;
  }

  private static generateUID(
    course: SelectedCourse,
    section: Section,
    period: Period,
    startDate: Date,
  ): string {
    const courseId = `${course.course.departmentAbbr}${course.course.number}`;
    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const day = String(startDate.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    const periodType = period.type.toLowerCase().replace(/\s+/g, '-');
    return `wpi-${courseId}-${section.number}-${periodType}-${dateStr}@wpiplannerv2`;
  }

  static generateICS(
    schedule: Schedule,
    options: ICSExportOptions = {},
  ): ICSExportResult {
    const timezone = options.timezone || this.DEFAULT_TIMEZONE;
    const service = TermBoundsService.getInstance();
    const academicYear =
      service.getCurrentAcademicYear() ?? new Date().getFullYear();

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

        for (const period of section.periods) {
          if (period.days.size === 0) {
            continue;
          }

          const firstMeetingDay = Array.from(period.days)[0];
          const firstMeetingDate = this.findNextDayOfWeek(
            termDates.start,
            firstMeetingDay,
          );

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
            startDateTime,
          );

          const courseId = `${selectedCourse.course.departmentAbbr}-${selectedCourse.course.number}`;
          const periodTypePrefix =
            period.type.charAt(0).toUpperCase() + period.type.slice(1);
          const summary = `${periodTypePrefix}: ${courseId} ${selectedCourse.course.name}`;

          const untilDate = new Date(termDates.end);
          untilDate.setHours(23, 59, 59, 0);

          const byDay = Array.from(period.days).map(
            day => this.DAY_TO_ICAL[day],
          );

          let description: string | undefined;
          if (options.includeDescription !== false) {
            const descParts: string[] = [];

            if (options.includeProfessor !== false && period.professor) {
              descParts.push(`Professor: ${period.professor}`);
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
            repeating: {
              freq: ICalEventRepeatingFreq.WEEKLY,
              byDay: byDay,
              until: untilDate,
            },
          });
        }
      }
    }

    if (schedule.localEvents?.length) {
      for (const localEvent of schedule.localEvents) {
        if (!localEvent.visible) continue;

        if (localEvent.eventType === EventType.ONE_TIME) {
          if (!localEvent.date) continue;

          const eventDate = new Date(localEvent.date);
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
            const termDates = this.getTermDates(term as string, academicYear);
            if (!termDates) continue;

            const days = localEvent.days || [];
            if (days.length === 0) continue;

            const firstDay: DayOfWeek = days.reduce(
              (earliest: DayOfWeek, day: DayOfWeek) => {
                const dayNum = this.DAY_TO_NUMBER[day];
                const earliestNum = this.DAY_TO_NUMBER[earliest];
                return dayNum < earliestNum ? day : earliest;
              },
            );

            const dayNumber = this.DAY_TO_NUMBER[firstDay];
            const firstOccurrence = new Date(termDates.start);

            const daysUntilTarget =
              (dayNumber - termDates.start.getDay() + 7) % 7;
            firstOccurrence.setDate(
              firstOccurrence.getDate() + daysUntilTarget,
            );

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

            const untilDate = new Date(termDates.end);
            untilDate.setHours(23, 59, 59, 0);

            const uid = `local-${localEvent.id}-${term}@wpiplannerv2`;

            const byDay = days.map((day: DayOfWeek) => this.DAY_TO_ICAL[day]);

            calendar.createEvent({
              id: uid,
              start: firstOccurrence,
              end: endTime,
              summary: localEvent.title,
              description: localEvent.description || undefined,
              timezone: timezone,
              repeating: {
                freq: ICalEventRepeatingFreq.WEEKLY,
                byDay: byDay,
                until: untilDate,
              },
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
