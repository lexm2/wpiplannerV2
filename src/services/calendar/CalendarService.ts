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
    ConnectedCalendar,
} from './types';
import { DAY_TO_RRULE } from './types';
import { expandRecurringEvents, type ExpandedEventsResult } from './rruleExpander';
import { TermBoundsService } from '../data/TermBoundsService';

/**
 * Result of fetching events for all terms.
 * Contains both expanded instances (for grid rendering) and parent events (for panel display).
 */
export interface AllTermsEventsResult {
    /** Expanded event instances by term (for grid placement) */
    instances: Map<string, CalendarEvent[]>;
    /** Parent events with recurrence info by term (for panel display) */
    parents: Map<string, CalendarEvent[]>;
}

// =============================================================================
// Term Date Constants (from ICSGenerator)
// =============================================================================

const TERM_DATES = {
    A: { startMonth: 7, startDay: 21, endMonth: 9, endDay: 10, nextYear: false },
    B: { startMonth: 9, startDay: 20, endMonth: 11, endDay: 12, nextYear: false },
    C: { startMonth: 0, startDay: 14, endMonth: 2, endDay: 6, nextYear: true },
    D: { startMonth: 2, startDay: 16, endMonth: 4, endDay: 6, nextYear: true },
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

        // Determine target calendar (priority: options > schedule.connectedCalendar > primary)
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
        } else if (options.targetCalendarId) {
            calendarId = options.targetCalendarId;
            calendarName = calendarId === 'primary' ? 'Primary Calendar' : calendarId;
        } else if (schedule.connectedCalendar) {
            calendarId = schedule.connectedCalendar.calendarId;
            calendarName = schedule.connectedCalendar.calendarName;
        } else {
            calendarId = 'primary';
            calendarName = 'Primary Calendar';
        }

        // Convert schedule to events
        const { events, skipped } = this.scheduleToEvents(schedule, options);

        console.log('[CalendarService] Converted schedule to events:', {
            scheduleName: schedule.name,
            totalCourses: schedule.selectedCourses.length,
            eventsGenerated: events.length,
            coursesSkipped: skipped,
            events: events.map(e => ({
                summary: e.summary,
                location: e.location,
                start: e.start.dateTime,
                recurrence: e.recurrence,
            })),
        });

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
            const result: CalendarExportResult = {
                success: true,
                calendarId,
                calendarName,
                eventsCreated: created.length,
                coursesSkipped: skipped,
                errors,
            };
            console.log('[CalendarService] Export completed:', result);
            return result;
        } catch (error) {
            const result: CalendarExportResult = {
                success: false,
                calendarId,
                calendarName,
                eventsCreated: 0,
                coursesSkipped: skipped,
                errors: [`Failed to create events: ${error}`],
            };
            console.error('[CalendarService] Export failed:', result);
            return result;
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

    /**
     * Create a default ConnectedCalendar for the primary calendar.
     */
    getDefaultConnectedCalendar(): ConnectedCalendar {
        return {
            providerId: this.provider?.id || 'google',
            calendarId: 'primary',
            calendarName: 'Primary Calendar',
        };
    }

    /**
     * Create a ConnectedCalendar from a CalendarInfo.
     */
    createConnectedCalendar(calendarInfo: CalendarInfo): ConnectedCalendar {
        return {
            providerId: this.provider?.id || 'google',
            calendarId: calendarInfo.id,
            calendarName: calendarInfo.name,
        };
    }

    // =========================================================================
    // External Event Display
    // =========================================================================

    /**
     * Get events for a specific term from a connected calendar.
     * Returns both expanded instances (for grid) and parent events (for panel).
     * @param connectedCalendar The connected calendar to fetch from
     * @param term The term letter (A, B, C, D)
     * @param academicYear The academic year (defaults to current year)
     * @returns Object with instances (for grid) and parents (for panel)
     */
    async getEventsForTerm(
        connectedCalendar: ConnectedCalendar,
        term: string,
        academicYear?: number
    ): Promise<ExpandedEventsResult> {
        console.log(`[CalendarService] getEventsForTerm called:`, {
            connectedCalendar,
            term,
            academicYear,
            providerReady: this.provider !== null,
            isAuthenticated: this.provider?.isAuthenticated(),
        });

        if (!this.provider || !this.provider.isAuthenticated()) {
            console.warn(`[CalendarService] Provider not ready - provider: ${!!this.provider}, authenticated: ${this.provider?.isAuthenticated()}`);
            return { instances: [], parents: [] };
        }

        const year = academicYear || new Date().getFullYear();
        const termDates = this.getTermDates(term, year);

        console.log(`[CalendarService] Term dates for ${term} (year ${year}):`, termDates);

        if (!termDates) {
            console.warn(`[CalendarService] Invalid term: ${term}`);
            return { instances: [], parents: [] };
        }

        try {
            console.log(`[CalendarService] Fetching events from calendar "${connectedCalendar.calendarId}" for ${termDates.start.toISOString()} to ${termDates.end.toISOString()}`);

            const rawEvents = await this.provider.getEvents(
                connectedCalendar.calendarId,
                termDates.start,
                termDates.end
            );

            console.log(`[CalendarService] Raw events received for term ${term}:`, rawEvents);

            // Expand recurring events - returns both instances and parents
            const { instances, parents } = expandRecurringEvents(rawEvents, termDates.start, termDates.end);
            console.log(`[CalendarService] Expanded ${rawEvents.length} events to ${instances.length} instances, ${parents.length} parents`);

            // Filter out excluded events from instances (check parentId for recurring events)
            const excludedIds = new Set(connectedCalendar.excludedEventIds || []);
            const filteredInstances = instances.filter(e => {
                // For instances, check parentId first (recurring), then id (non-recurring)
                const idToCheck = e.parentId || e.id;
                if (idToCheck && excludedIds.has(idToCheck)) return false;
                return true;
            });

            // Filter out excluded events from parents (check id directly)
            const filteredParents = parents.filter(e => {
                if (e.id && excludedIds.has(e.id)) return false;
                return true;
            });

            console.log(`[CalendarService] Fetched ${instances.length} instances for term ${term}, ${filteredInstances.length} after exclusions`);
            return { instances: filteredInstances, parents: filteredParents };
        } catch (error) {
            console.error(`[CalendarService] Failed to fetch events for term ${term}:`, error);
            return { instances: [], parents: [] };
        }
    }

    /**
     * Get events for all terms from a connected calendar.
     * Returns both expanded instances (for grid) and parent events (for panel).
     * @param connectedCalendar The connected calendar to fetch from
     * @param academicYear The academic year (defaults to current year)
     * @returns Object with instances map (for grid) and parents map (for panel)
     */
    async getEventsForAllTerms(
        connectedCalendar: ConnectedCalendar,
        academicYear?: number
    ): Promise<AllTermsEventsResult> {
        const instancesMap = new Map<string, CalendarEvent[]>();
        const parentsMap = new Map<string, CalendarEvent[]>();
        const terms = ['A', 'B', 'C', 'D'];

        // Fetch all terms in parallel
        const promises = terms.map(async (term) => {
            const { instances, parents } = await this.getEventsForTerm(connectedCalendar, term, academicYear);
            return { term, instances, parents };
        });

        const results = await Promise.all(promises);
        for (const { term, instances, parents } of results) {
            instancesMap.set(term, instances);
            parentsMap.set(term, parents);
        }

        return { instances: instancesMap, parents: parentsMap };
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

        const termLetter = term.charAt(0).toUpperCase() as 'A' | 'B' | 'C' | 'D';

        const termBoundsService = TermBoundsService.getInstance();
        const boundsFromService = termBoundsService.getTermDates(termLetter);

        if (boundsFromService) {
            return boundsFromService;
        }

        console.warn(`[CalendarService] Using fallback TERM_DATES for term ${termLetter}`);
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
