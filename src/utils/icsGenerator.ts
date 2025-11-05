/**
 * ICS Calendar Generator
 * Exports WPI course schedules to iCalendar (.ics) format
 * Compatible with Google Calendar, Outlook, Apple Calendar, etc.
 */

import { Schedule, SelectedCourse } from '../types/schedule';
import { Section, Period, DayOfWeek } from '../types/types';
import { getAllSections } from './courseUtils';

export interface ICSExportOptions {
    academicYear?: number;
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

    private static dayToICS(day: DayOfWeek): string {
        const mapping: Record<DayOfWeek, string> = {
            [DayOfWeek.MONDAY]: 'MO',
            [DayOfWeek.TUESDAY]: 'TU',
            [DayOfWeek.WEDNESDAY]: 'WE',
            [DayOfWeek.THURSDAY]: 'TH',
            [DayOfWeek.FRIDAY]: 'FR',
            [DayOfWeek.SATURDAY]: 'SA',
            [DayOfWeek.SUNDAY]: 'SU'
        };
        return mapping[day];
    }

    private static getTermDates(term: string, year: number): { start: Date, end: Date } | null {
        if (!term || term === 'TBA') {
            return null;
        }

        const termLetter = term.charAt(0).toUpperCase();

        switch (termLetter) {
            case 'A':
                return {
                    start: new Date(year, 7, 25),
                    end: new Date(year, 9, 13)
                };
            case 'B':
                return {
                    start: new Date(year, 9, 21),
                    end: new Date(year, 11, 13)
                };
            case 'C':
                return {
                    start: new Date(year + 1, 0, 6),
                    end: new Date(year + 1, 2, 7)
                };
            case 'D':
                return {
                    start: new Date(year + 1, 2, 17),
                    end: new Date(year + 1, 4, 9)
                };
            default:
                return null;
        }
    }

    private static formatICSDate(date: Date, includeTime: boolean = false): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        if (!includeTime) {
            return `${year}${month}${day}`;
        }

        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${year}${month}${day}T${hours}${minutes}${seconds}`;
    }

    private static createDateTime(baseDate: Date, hours: number, minutes: number): Date {
        const dt = new Date(baseDate);
        dt.setHours(hours, minutes, 0, 0);
        return dt;
    }

    private static findNextDayOfWeek(startDate: Date, targetDay: DayOfWeek): Date {
        const dayMapping: Record<DayOfWeek, number> = {
            [DayOfWeek.SUNDAY]: 0,
            [DayOfWeek.MONDAY]: 1,
            [DayOfWeek.TUESDAY]: 2,
            [DayOfWeek.WEDNESDAY]: 3,
            [DayOfWeek.THURSDAY]: 4,
            [DayOfWeek.FRIDAY]: 5,
            [DayOfWeek.SATURDAY]: 6
        };

        const targetDayNum = dayMapping[targetDay];
        const currentDayNum = startDate.getDay();
        let daysToAdd = targetDayNum - currentDayNum;

        if (daysToAdd < 0) {
            daysToAdd += 7;
        }

        const result = new Date(startDate);
        result.setDate(result.getDate() + daysToAdd);
        return result;
    }

    private static escapeICSText(text: string): string {
        return text
            .replace(/\\/g, '\\\\')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,')
            .replace(/\n/g, '\\n');
    }

    private static generateUID(course: SelectedCourse, section: Section, period: Period, startDate: Date): string {
        const courseId = `${course.course.department.abbreviation}${course.course.number}`;
        const dateStr = this.formatICSDate(startDate, false);
        const periodType = period.type.toLowerCase().replace(/\s+/g, '-');
        return `wpi-${courseId}-${section.number}-${periodType}-${dateStr}@wpiplannerv2`;
    }

    private static generateEvent(
        course: SelectedCourse,
        section: Section,
        period: Period,
        termDates: { start: Date, end: Date },
        timezone: string,
        options: ICSExportOptions
    ): string {
        const lines: string[] = [];

        lines.push('BEGIN:VEVENT');

        const firstMeetingDay = Array.from(period.days)[0];
        const firstMeetingDate = this.findNextDayOfWeek(termDates.start, firstMeetingDay);

        const startDateTime = this.createDateTime(firstMeetingDate, period.startTime.hours, period.startTime.minutes);
        const endDateTime = this.createDateTime(firstMeetingDate, period.endTime.hours, period.endTime.minutes);

        const uid = this.generateUID(course, section, period, startDateTime);
        lines.push(`UID:${uid}`);

        const now = new Date();
        lines.push(`DTSTAMP:${this.formatICSDate(now, true)}Z`);

        lines.push(`DTSTART;TZID=${timezone}:${this.formatICSDate(startDateTime, true)}`);
        lines.push(`DTEND;TZID=${timezone}:${this.formatICSDate(endDateTime, true)}`);

        const byDays = Array.from(period.days)
            .map(day => this.dayToICS(day))
            .join(',');
        const untilDate = new Date(termDates.end);
        untilDate.setHours(23, 59, 59, 0);
        const untilStr = this.formatICSDate(untilDate, true);

        lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${byDays};UNTIL=${untilStr}`);

        const courseId = `${course.course.department.abbreviation}-${course.course.number}`;
        const periodTypePrefix = period.type.charAt(0).toUpperCase() + period.type.slice(1);
        const summary = `${periodTypePrefix}: ${courseId} ${course.course.name}`;
        lines.push(`SUMMARY:${this.escapeICSText(summary)}`);

        if (period.location || period.building) {
            const location = period.location || `${period.building} ${period.room}`.trim();
            lines.push(`LOCATION:${this.escapeICSText(location)}`);
        }

        if (options.includeDescription !== false) {
            const descParts: string[] = [];

            if (options.includeProfessor !== false && period.professor) {
                descParts.push(`Professor: ${period.professor}`);
            }

            descParts.push(`CRN: ${section.crn}`);
            descParts.push(`Section: ${section.number}`);

            if (course.course.description) {
                descParts.push('');
                descParts.push(course.course.description);
            }

            const description = descParts.join('\\n');
            lines.push(`DESCRIPTION:${this.escapeICSText(description)}`);
        }

        lines.push('END:VEVENT');

        return lines.join('\r\n');
    }

    private static generateTimezoneComponent(timezone: string): string {
        if (timezone !== 'America/New_York') {
            return '';
        }

        return `BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE`;
    }

    static generateICS(schedule: Schedule, options: ICSExportOptions = {}): ICSExportResult {
        const timezone = options.timezone || this.DEFAULT_TIMEZONE;
        const academicYear = options.academicYear || new Date().getFullYear();

        const events: string[] = [];
        let skippedCourses = 0;
        const totalCourses = schedule.selectedCourses.length;

        for (const selectedCourse of schedule.selectedCourses) {
            if (!selectedCourse.selectedSection) {
                skippedCourses++;
                continue;
            }

            const sections = getAllSections(selectedCourse.course);
            const section = sections.find(
                (s: Section) => s.number === selectedCourse.selectedSectionNumber
            );

            if (!section) {
                skippedCourses++;
                continue;
            }

            const termDates = this.getTermDates(section.computedTerm, academicYear);
            if (!termDates) {
                skippedCourses++;
                continue;
            }

            for (const period of section.periods) {
                if (period.days.size === 0) {
                    continue;
                }

                const event = this.generateEvent(
                    selectedCourse,
                    section,
                    period,
                    termDates,
                    timezone,
                    options
                );

                events.push(event);
            }
        }

        if (events.length === 0) {
            return {
                success: false,
                skippedCourses,
                totalCourses,
                error: skippedCourses > 0
                    ? 'No courses with selected sections found'
                    : 'No valid courses to export'
            };
        }

        const icsLines: string[] = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//WPI Course Planner V2//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            `X-WR-CALNAME:${this.escapeICSText(schedule.name)}`,
            `X-WR-TIMEZONE:${timezone}`,
            this.generateTimezoneComponent(timezone),
            ...events,
            'END:VCALENDAR'
        ];

        const icsData = icsLines.filter(line => line.length > 0).join('\r\n');

        return {
            success: true,
            data: icsData,
            skippedCourses,
            totalCourses
        };
    }
}
