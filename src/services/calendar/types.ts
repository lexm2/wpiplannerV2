// =============================================================================
// Calendar Service Types - Provider-Agnostic Calendar API
// =============================================================================

// -----------------------------------------------------------------------------
// Connected Calendar (stored on Schedule)
// -----------------------------------------------------------------------------

/**
 * Represents a calendar connection for a schedule.
 * Stored on the Schedule object to track which calendar events are synced to/from.
 */
export interface ConnectedCalendar {
    /** Provider identifier (e.g., 'google', 'outlook') */
    providerId: string;
    /** Calendar ID within the provider ('primary' or specific calendar ID) */
    calendarId: string;
    /** Human-readable calendar name for display */
    calendarName: string;
    /** Event IDs to exclude from display (hidden events) */
    excludedEventIds?: string[];
}

// -----------------------------------------------------------------------------
// Calendar Event Types
// -----------------------------------------------------------------------------

/**
 * Represents a calendar event in a provider-agnostic format.
 * Compatible with Google Calendar, Outlook, and other calendar APIs.
 */
export interface CalendarEvent {
    /** Provider-assigned event ID (undefined for new events) */
    id?: string;
    /** Parent event ID for expanded recurring event instances */
    parentId?: string;
    /** Event title */
    summary: string;
    /** Event description/notes */
    description?: string;
    /** Physical location */
    location?: string;
    /** Event start time */
    start: EventDateTime;
    /** Event end time */
    end: EventDateTime;
    /** Recurrence rules (RRULE format) */
    recurrence?: string[];
    /** Provider-specific color ID */
    colorId?: string;
    /** Human-readable recurrence description (e.g., "Weekly on Mon, Wed, Fri") */
    recurrenceDescription?: string;
    /** Number of occurrences in the current term (for parent events only) */
    occurrenceCount?: number;
}

/**
 * Date/time representation for calendar events.
 */
export interface EventDateTime {
    /** ISO 8601 formatted date-time string */
    dateTime: string;
    /** IANA timezone identifier (e.g., 'America/New_York') */
    timeZone: string;
}

/**
 * Information about a calendar.
 */
export interface CalendarInfo {
    /** Provider-assigned calendar ID */
    id: string;
    /** Calendar display name */
    name: string;
    /** Whether this is the user's primary calendar */
    isPrimary: boolean;
    /** Calendar color (hex or provider-specific) */
    color?: string;
    /** Whether the user can modify this calendar */
    canEdit?: boolean;
}

// -----------------------------------------------------------------------------
// Export Types
// -----------------------------------------------------------------------------

/**
 * Options for exporting a schedule to a calendar.
 */
export interface CalendarExportOptions {
    /** ID of existing calendar to export to */
    targetCalendarId?: string;
    /** Name for a new calendar to create (mutually exclusive with targetCalendarId) */
    createCalendar?: string;
    /** Academic year for term date calculations (defaults to current year) */
    academicYear?: number;
    /** Include course description in event details */
    includeDescription?: boolean;
    /** Include professor name in event details */
    includeProfessor?: boolean;
    /** Timezone for events (defaults to America/New_York) */
    timezone?: string;
}

/**
 * Result of a calendar export operation.
 */
export interface CalendarExportResult {
    /** Whether the export completed successfully */
    success: boolean;
    /** ID of the calendar events were exported to */
    calendarId: string;
    /** Display name of the calendar */
    calendarName: string;
    /** Number of events successfully created */
    eventsCreated: number;
    /** Number of courses skipped (no selected section, async, etc.) */
    coursesSkipped: number;
    /** Error messages for any failed operations */
    errors: string[];
}

// -----------------------------------------------------------------------------
// Provider Interface
// -----------------------------------------------------------------------------

/**
 * Provider-agnostic interface for calendar operations.
 * Implement this interface to add support for new calendar providers
 * (Google Calendar, Outlook, Apple Calendar, etc.).
 */
export interface CalendarProvider {
    /** Unique provider identifier */
    readonly id: string;
    /** Human-readable provider name */
    readonly displayName: string;

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    /**
     * Initialize the provider (load APIs, restore state, etc.).
     * Must be called before any other operations.
     */
    initialize(): Promise<void>;

    /**
     * Clean up resources when the provider is no longer needed.
     */
    dispose(): void;

    // -------------------------------------------------------------------------
    // Authentication
    // -------------------------------------------------------------------------

    /**
     * Check if the provider has valid authentication.
     * Calendar providers typically share auth with their cloud sync counterpart.
     */
    isAuthenticated(): boolean;

    /**
     * Set the access token (typically injected from the parent auth provider).
     */
    setAccessToken(token: string): void;

    // -------------------------------------------------------------------------
    // Calendar Operations
    // -------------------------------------------------------------------------

    /**
     * List all calendars accessible to the user.
     */
    listCalendars(): Promise<CalendarInfo[]>;

    /**
     * Create a new calendar.
     * @param name Display name for the new calendar
     * @returns The created calendar info
     */
    createCalendar(name: string): Promise<CalendarInfo>;

    /**
     * Delete a calendar.
     * @param calendarId ID of the calendar to delete
     */
    deleteCalendar(calendarId: string): Promise<void>;

    // -------------------------------------------------------------------------
    // Event Operations
    // -------------------------------------------------------------------------

    /**
     * Get events from a calendar within a time range.
     * @param calendarId Calendar to query ('primary' for default calendar)
     * @param timeMin Start of time range
     * @param timeMax End of time range
     */
    getEvents(calendarId: string, timeMin: Date, timeMax: Date): Promise<CalendarEvent[]>;

    /**
     * Create a single event.
     * @param calendarId Target calendar ID
     * @param event Event to create
     * @returns The created event with provider-assigned ID
     */
    createEvent(calendarId: string, event: CalendarEvent): Promise<CalendarEvent>;

    /**
     * Create multiple events (batch operation).
     * @param calendarId Target calendar ID
     * @param events Events to create
     * @returns The created events with provider-assigned IDs
     */
    createEvents(calendarId: string, events: CalendarEvent[]): Promise<CalendarEvent[]>;

    /**
     * Delete a single event.
     * @param calendarId Calendar containing the event
     * @param eventId ID of the event to delete
     */
    deleteEvent(calendarId: string, eventId: string): Promise<void>;

    /**
     * Delete all events from a calendar.
     * @param calendarId Calendar to clear
     */
    clearEvents(calendarId: string): Promise<void>;
}

// -----------------------------------------------------------------------------
// Internal Types (for conversion logic)
// -----------------------------------------------------------------------------

/**
 * Term date range for academic calendar calculations.
 */
export interface TermDates {
    start: Date;
    end: Date;
}

/**
 * Day of week mapping for recurrence rules.
 */
export const DAY_TO_RRULE: Record<string, string> = {
    'M': 'MO',
    'T': 'TU',
    'W': 'WE',
    'R': 'TH',
    'F': 'FR',
    'S': 'SA',
    'U': 'SU'
};

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

import { DayOfWeek } from '../../types/types';
import { AcademicTerm, WeeklyTimeSlot } from '../../types/schedule';

/**
 * Convert a calendar event to a WeeklyTimeSlot.
 * Returns null if the event is on a weekend or cannot be converted.
 *
 * @param event - The calendar event to convert
 * @param term - The academic term this event belongs to ('A', 'B', 'C', 'D')
 * @returns WeeklyTimeSlot or null if conversion not possible
 */
export function calendarEventToWeeklySlot(
    event: CalendarEvent,
    term: string
): WeeklyTimeSlot | null {
    // Parse event datetime
    const startDate = new Date(event.start.dateTime);
    const endDate = new Date(event.end.dateTime);

    // Get day of week (0=Sun, 1=Mon, etc.)
    const dayIndex = startDate.getDay();

    // Skip weekend events
    if (dayIndex === 0 || dayIndex === 6) return null;

    // Convert to DayOfWeek enum
    const dayMap: Record<number, DayOfWeek> = {
        1: DayOfWeek.MONDAY,
        2: DayOfWeek.TUESDAY,
        3: DayOfWeek.WEDNESDAY,
        4: DayOfWeek.THURSDAY,
        5: DayOfWeek.FRIDAY
    };
    const day = dayMap[dayIndex];
    if (!day) return null;

    // Map term string to AcademicTerm enum
    const termMap: Record<string, AcademicTerm> = {
        'A': AcademicTerm.A,
        'B': AcademicTerm.B,
        'C': AcademicTerm.C,
        'D': AcademicTerm.D
    };
    const academicTerm = termMap[term];
    if (!academicTerm) return null;

    // Create time objects
    const startTime = { hours: startDate.getHours(), minutes: startDate.getMinutes() };
    const endTime = { hours: endDate.getHours(), minutes: endDate.getMinutes() };

    return {
        id: `calendar-${event.id || `${term}-${day}-${startTime.hours}:${startTime.minutes}`}`,
        day,
        startTime,
        endTime,
        term: academicTerm
    };
}

// -----------------------------------------------------------------------------
// Term Bounds Types
// -----------------------------------------------------------------------------

export interface TermBoundsData {
    academicYear: string;
    generated: string;
    terms: {
        A: TermBoundInfo;
        B: TermBoundInfo;
        C: TermBoundInfo;
        D: TermBoundInfo;
    };
}

export interface TermBoundInfo {
    startDate: string;
    endDate: string;
    offeringPeriod: string;
    sampleSize: number;
}
