// =============================================================================
// Calendar Service - Provider-Agnostic Calendar Operations
// =============================================================================

import type { Schedule, SelectedCourse } from '../../types/schedule';
import type { Section, Period, DayOfWeek } from '../../types/types';
import { getAllSections } from '../../utils/courseUtils';
import type {
    CalendarProvider,
    CalendarEvent,
    CalendarInfo,
    CalendarExportOptions,
    CalendarExportResult,
    TermDates,
} from './types';
import { DAY_TO_RRULE } from './types';

// =============================================================================
// Term Date Constants (from ICSGenerator)
// =============================================================================

const TERM_DATES = {
    A: { startMonth: 7, startDay: 25, endMonth: 9, endDay: 13 },
    B: { startMonth: 9, startDay: 21, endMonth: 11, endDay: 13 },
    C: { startMonth: 0, startDay: 6, endMonth: 2, endDay: 7, nextYear: true },
    D: { startMonth: 2, startDay: 17, endMonth: 4, endDay: 9, nextYear: true },
} as const;

const DAY_TO_NUMBER: Record<string, number> = {
    'U': 0, // Sunday
    'M': 1,
    'T': 2,
    'W': 3,
    'R': 4,
    'F': 5,
    'S': 6,
};

// =============================================================================
// CalendarService
// =============================================================================

/**
 * Provider-agnostic calendar service.
 * Handles schedule-to-event conversion and orchestrates calendar operations
 * through any CalendarProvider implementation.
 */
export class CalendarService {
    private provider: CalendarProvider | null = null;
    private static instance: CalendarService;

    private constructor() {}

    static getInstance(): CalendarService {
        if (!CalendarService.instance) {
            CalendarService.instance = new CalendarService();
        }
        return CalendarService.instance;
    }

    // =========================================================================
    // Provider Management
    // =========================================================================

    /**
     * Set the active calendar provider.
     */
    setProvider(provider: CalendarProvider): void {
        this.provider = provider;
    }

    /**
     * Get the active calendar provider.
     */
    getProvider(): CalendarProvider | null {
        return this.provider;
    }

    /**
     * Check if a provider is configured and authenticated.
     */
    isReady(): boolean {
        return this.provider !== null && this.provider.isAuthenticated();
    }

    // =========================================================================
    // High-Level Operations
    // =========================================================================

    /**
     * Export a schedule to the calendar provider.
     */
    async exportSchedule(
        schedule: Schedule,
        options: CalendarExportOptions = {}
    ): Promise<CalendarExportResult> {
        if (!this.provider) {
            return {
                success: false,
                calendarId: '',
                calendarName: '',
                eventsCreated: 0,
                coursesSkipped: 0,
                errors: ['No calendar provider configured'],
            };
        }

        if (!this.provider.isAuthenticated()) {
            return {
                success: false,
                calendarId: '',
                calendarName: '',
                eventsCreated: 0,
                coursesSkipped: 0,
                errors: ['Not authenticated with calendar provider'],
            };
        }

        const errors: string[] = [];

        // Determine target calendar
        let calendarId: string;
        let calendarName: string;

        if (options.createCalendar) {
            try {
                const calendar = await this.provider.createCalendar(options.createCalendar);
                calendarId = calendar.id;
                calendarName = calendar.name;
            } catch (error) {
                return {
                    success: false,
                    calendarId: '',
                    calendarName: '',
                    eventsCreated: 0,
                    coursesSkipped: 0,
                    errors: [`Failed to create calendar: ${error}`],
                };
            }
        } else {
            calendarId = options.targetCalendarId || 'primary';
            calendarName = calendarId === 'primary' ? 'Primary Calendar' : calendarId;
        }

        // Convert schedule to events
        const { events, skipped } = this.scheduleToEvents(schedule, options);

        if (events.length === 0) {
            return {
                success: false,
                calendarId,
                calendarName,
                eventsCreated: 0,
                coursesSkipped: skipped,
                errors: ['No valid events to export'],
            };
        }

        // Create events
        try {
            const created = await this.provider.createEvents(calendarId, events);
            return {
                success: true,
                calendarId,
                calendarName,
                eventsCreated: created.length,
                coursesSkipped: skipped,
                errors,
            };
        } catch (error) {
            return {
                success: false,
                calendarId,
                calendarName,
                eventsCreated: 0,
                coursesSkipped: skipped,
                errors: [`Failed to create events: ${error}`],
            };
        }
    }

    /**
     * Get events from a calendar within a time range.
     */
    async getEvents(
        calendarId: string,
        timeMin: Date,
        timeMax: Date
    ): Promise<CalendarEvent[]> {
        if (!this.provider || !this.provider.isAuthenticated()) {
            return [];
        }
        return this.provider.getEvents(calendarId, timeMin, timeMax);
    }

    /**
     * List all available calendars.
     */
    async listCalendars(): Promise<CalendarInfo[]> {
        if (!this.provider || !this.provider.isAuthenticated()) {
            return [];
        }
        return this.provider.listCalendars();
    }

    /**
     * Find an existing calendar by name, or create it if it doesn't exist.
     */
    async findOrCreateCalendar(name: string): Promise<CalendarInfo | null> {
        if (!this.provider || !this.provider.isAuthenticated()) {
            return null;
        }

        const calendars = await this.provider.listCalendars();
        const existing = calendars.find(c => c.name === name);

        if (existing) {
            return existing;
        }

        return this.provider.createCalendar(name);
    }

    // =========================================================================
    // Schedule to Event Conversion
    // =========================================================================

    /**
     * Convert a schedule to calendar events.
     */
    scheduleToEvents(
        schedule: Schedule,
        options: CalendarExportOptions = {}
    ): { events: CalendarEvent[]; skipped: number } {
        const events: CalendarEvent[] = [];
        let skipped = 0;
        const academicYear = options.academicYear || new Date().getFullYear();
        const timezone = options.timezone || 'America/New_York';

        for (const selectedCourse of schedule.selectedCourses) {
            if (!selectedCourse.selectedSection) {
                skipped++;
                continue;
            }

            const sections = getAllSections(selectedCourse.course);
            const section = sections.find(
                (s: Section) => s.number === selectedCourse.selectedSectionNumber
            );

            if (!section) {
                skipped++;
                continue;
            }

            const termDates = this.getTermDates(section.computedTerm, academicYear);
            if (!termDates) {
                skipped++;
                continue;
            }

            for (const period of section.periods) {
                if (period.days.size === 0 || period.isAsync) {
                    continue;
                }

                const event = this.periodToEvent(
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

        return { events, skipped };
    }

    // =========================================================================
    // Private Helpers
    // =========================================================================

    private periodToEvent(
        course: SelectedCourse,
        section: Section,
        period: Period,
        termDates: TermDates,
        timezone: string,
        options: CalendarExportOptions
    ): CalendarEvent {
        const daysArray = Array.from(period.days);
        const firstDay = daysArray[0];
        const firstMeetingDate = this.findNextDayOfWeek(termDates.start, firstDay);

        const startDateTime = this.createDateTime(
            firstMeetingDate,
            period.startTime.hours,
            period.startTime.minutes
        );
        const endDateTime = this.createDateTime(
            firstMeetingDate,
            period.endTime.hours,
            period.endTime.minutes
        );

        // Build summary
        const courseId = `${course.course.department.abbreviation}-${course.course.number}`;
        const periodType = period.type.charAt(0).toUpperCase() + period.type.slice(1);
        const summary = `${periodType}: ${courseId} ${course.course.name}`;

        // Build location
        const location = period.location ||
            (period.building && period.room ? `${period.building} ${period.room}` : undefined);

        // Build description
        const descParts: string[] = [];
        if (options.includeProfessor !== false && period.professor) {
            descParts.push(`Professor: ${period.professor}`);
        }
        descParts.push(`CRN: ${section.crn}`);
        descParts.push(`Section: ${section.number}`);
        if (options.includeDescription !== false && course.course.description) {
            descParts.push('', course.course.description);
        }

        // Build recurrence rule
        const byDays = daysArray
            .map(day => DAY_TO_RRULE[day as string] || day)
            .join(',');
        const untilDate = new Date(termDates.end);
        untilDate.setHours(23, 59, 59, 0);
        const untilStr = this.formatRRuleDate(untilDate);

        return {
            summary,
            description: descParts.join('\n'),
            location,
            start: {
                dateTime: startDateTime.toISOString(),
                timeZone: timezone,
            },
            end: {
                dateTime: endDateTime.toISOString(),
                timeZone: timezone,
            },
            recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byDays};UNTIL=${untilStr}`],
        };
    }

    private getTermDates(term: string, year: number): TermDates | null {
        if (!term || term === 'TBA') {
            return null;
        }

        const termLetter = term.charAt(0).toUpperCase() as keyof typeof TERM_DATES;
        const termConfig = TERM_DATES[termLetter];

        if (!termConfig) {
            return null;
        }

        const startYear = termConfig.nextYear ? year + 1 : year;
        const endYear = termConfig.nextYear ? year + 1 : year;

        return {
            start: new Date(startYear, termConfig.startMonth, termConfig.startDay),
            end: new Date(endYear, termConfig.endMonth, termConfig.endDay),
        };
    }

    private findNextDayOfWeek(startDate: Date, targetDay: DayOfWeek): Date {
        const targetDayNum = DAY_TO_NUMBER[targetDay as string] ?? 0;
        const currentDayNum = startDate.getDay();
        let daysToAdd = targetDayNum - currentDayNum;

        if (daysToAdd < 0) {
            daysToAdd += 7;
        }

        const result = new Date(startDate);
        result.setDate(result.getDate() + daysToAdd);
        return result;
    }

    private createDateTime(baseDate: Date, hours: number, minutes: number): Date {
        const dt = new Date(baseDate);
        dt.setHours(hours, minutes, 0, 0);
        return dt;
    }

    private formatRRuleDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}T${hours}${minutes}${seconds}`;
    }
}

// Export singleton instance
export const calendarService = CalendarService.getInstance();
