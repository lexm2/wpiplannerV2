// =============================================================================
// Google Calendar Provider - Google Calendar API v3 Implementation
// =============================================================================

import type {
    CalendarProvider,
    CalendarEvent,
    CalendarInfo,
    ConnectedCalendar,
} from '../../types';
import type { Schedule } from '../../../../types/schedule';
import { ProfileStateManager } from '../../../../core/state/ProfileStateManager';

declare const gapi: any;

export type OnAuthenticatedCallback = (provider: GoogleCalendarProvider) => void;

/**
 * Google Calendar provider implementation.
 * Uses Google Calendar API v3 via gapi client.
 * Shares authentication with GoogleDriveProvider (same OAuth token).
 */
export class GoogleCalendarProvider implements CalendarProvider {
    readonly id = 'google';
    readonly displayName = 'Google Calendar';

    private accessToken: string | null = null;
    private initialized = false;
    private calendarApiLoaded = false;
    private onAuthenticatedCallback: OnAuthenticatedCallback | null = null;

    // =========================================================================
    // Lifecycle
    // =========================================================================

    async initialize(): Promise<void> {
        if (this.initialized) return;

        await this.loadCalendarApi();
        this.initialized = true;
        console.log('[GoogleCalendarProvider] Initialized');
    }

    dispose(): void {
        this.accessToken = null;
        this.initialized = false;
        console.log('[GoogleCalendarProvider] Disposed');
    }

    // =========================================================================
    // Authentication
    // =========================================================================

    isAuthenticated(): boolean {
        return this.accessToken !== null;
    }

    setAccessToken(token: string): void {
        this.accessToken = token;
        if (typeof gapi !== 'undefined' && gapi.client) {
            gapi.client.setToken({ access_token: token });
        }
        console.log('[GoogleCalendarProvider] Access token set');

        // Fire callback if registered
        if (this.onAuthenticatedCallback) {
            this.onAuthenticatedCallback(this);
        }
    }

    /**
     * Register a callback to be called when authentication is complete.
     */
    onAuthenticated(callback: OnAuthenticatedCallback): void {
        this.onAuthenticatedCallback = callback;
    }

    // =========================================================================
    // Google-Specific: Default Calendar & Auto-Connect
    // =========================================================================

    /**
     * Get the default Google Calendar connection (primary calendar).
     */
    getDefaultConnectedCalendar(): ConnectedCalendar {
        const defaultCalendar: ConnectedCalendar = {
            providerId: this.id,
            calendarId: 'primary',
            calendarName: 'Primary Calendar',
        };
        console.log('[GoogleCalendarProvider] Default calendar:', defaultCalendar);
        return defaultCalendar;
    }

    /**
     * Auto-connect schedules that don't have a connected calendar.
     * Returns the number of schedules that were connected.
     */
    autoConnectSchedules(
        schedules: Schedule[],
        updateSchedule: (scheduleId: string, updates: Partial<Schedule>) => void
    ): number {
        const defaultCalendar = this.getDefaultConnectedCalendar();
        let connectedCount = 0;

        console.log('[GoogleCalendarProvider] Auto-connecting schedules:', {
            totalSchedules: schedules.length,
            schedulesWithoutCalendar: schedules.filter(s => !s.connectedCalendar).length,
        });

        const stateManager = ProfileStateManager.getInstance();
        stateManager.withBatchSync(() => {
            for (const schedule of schedules) {
                console.log(`[GoogleCalendarProvider] Schedule "${schedule.name}":`, {
                    id: schedule.id,
                    hasConnectedCalendar: !!schedule.connectedCalendar,
                    connectedCalendar: schedule.connectedCalendar,
                });

                if (!schedule.connectedCalendar) {
                    updateSchedule(schedule.id, { connectedCalendar: defaultCalendar });
                    connectedCount++;
                    console.log(`[GoogleCalendarProvider] Connected calendar to schedule "${schedule.name}"`);
                }
            }
        });

        if (connectedCount > 0) {
            console.log(`[GoogleCalendarProvider] Auto-connected ${connectedCount} schedule(s)`);
        }

        return connectedCount;
    }

    // =========================================================================
    // Calendar Operations
    // =========================================================================

    async listCalendars(): Promise<CalendarInfo[]> {
        this.ensureAuthenticated();
        this.ensureApiLoaded();

        const response = await gapi.client.calendar.calendarList.list();
        const items = response.result.items || [];

        const calendars = items.map((cal: any) => ({
            id: cal.id,
            name: cal.summary,
            isPrimary: cal.primary === true,
            color: cal.backgroundColor,
            canEdit: cal.accessRole === 'owner' || cal.accessRole === 'writer',
        }));

        console.log('[GoogleCalendarProvider] Listed calendars:', calendars);
        return calendars;
    }

    async createCalendar(name: string): Promise<CalendarInfo> {
        this.ensureAuthenticated();
        this.ensureApiLoaded();

        const response = await gapi.client.calendar.calendars.insert({
            resource: {
                summary: name,
                timeZone: 'America/New_York',
            },
        });

        const cal = response.result;
        console.log(`[GoogleCalendarProvider] Created calendar: ${name}`);

        return {
            id: cal.id,
            name: cal.summary,
            isPrimary: false,
            canEdit: true,
        };
    }

    async deleteCalendar(calendarId: string): Promise<void> {
        this.ensureAuthenticated();
        this.ensureApiLoaded();

        if (calendarId === 'primary') {
            throw new Error('Cannot delete primary calendar');
        }

        await gapi.client.calendar.calendars.delete({
            calendarId,
        });

        console.log(`[GoogleCalendarProvider] Deleted calendar: ${calendarId}`);
    }

    // =========================================================================
    // Event Operations
    // =========================================================================

    async getEvents(
        calendarId: string,
        timeMin: Date,
        timeMax: Date
    ): Promise<CalendarEvent[]> {
        this.ensureAuthenticated();
        this.ensureApiLoaded();

        console.log('[GoogleCalendarProvider] Fetching events:', {
            calendarId,
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
        });

        const response = await gapi.client.calendar.events.list({
            calendarId,
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: false, // Get recurring events as-is for local RRULE expansion
            maxResults: 250,
        });

        const items = response.result.items || [];
        const events = items.map((event: any) => this.mapGoogleEventToCalendarEvent(event));

        return events;
    }

    async createEvent(calendarId: string, event: CalendarEvent): Promise<CalendarEvent> {
        this.ensureAuthenticated();
        this.ensureApiLoaded();

        const googleEvent = this.mapCalendarEventToGoogleEvent(event);

        const response = await gapi.client.calendar.events.insert({
            calendarId,
            resource: googleEvent,
        });

        return this.mapGoogleEventToCalendarEvent(response.result);
    }

    async createEvents(
        calendarId: string,
        events: CalendarEvent[]
    ): Promise<CalendarEvent[]> {
        this.ensureAuthenticated();
        this.ensureApiLoaded();

        // Google Calendar API doesn't have a true batch insert for events,
        // so we create them sequentially but with Promise.all for concurrency
        const BATCH_SIZE = 10;
        const results: CalendarEvent[] = [];

        for (let i = 0; i < events.length; i += BATCH_SIZE) {
            const batch = events.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(
                batch.map(event => this.createEvent(calendarId, event))
            );
            results.push(...batchResults);
        }

        console.log(`[GoogleCalendarProvider] Created ${results.length} events`);
        return results;
    }

    async deleteEvent(calendarId: string, eventId: string): Promise<void> {
        this.ensureAuthenticated();
        this.ensureApiLoaded();

        await gapi.client.calendar.events.delete({
            calendarId,
            eventId,
        });
    }

    async clearEvents(calendarId: string): Promise<void> {
        this.ensureAuthenticated();
        this.ensureApiLoaded();

        // Get all events
        const events = await this.getAllEvents(calendarId);

        // Delete in batches
        const BATCH_SIZE = 10;
        for (let i = 0; i < events.length; i += BATCH_SIZE) {
            const batch = events.slice(i, i + BATCH_SIZE);
            await Promise.all(
                batch.map(event =>
                    event.id ? this.deleteEvent(calendarId, event.id) : Promise.resolve()
                )
            );
        }

        console.log(`[GoogleCalendarProvider] Cleared ${events.length} events from ${calendarId}`);
    }

    // =========================================================================
    // Private Helpers
    // =========================================================================

    private async loadCalendarApi(): Promise<void> {
        return new Promise((resolve) => {
            const checkLoaded = setInterval(() => {
                if (typeof gapi !== 'undefined' && gapi.client) {
                    clearInterval(checkLoaded);
                    gapi.client.load('calendar', 'v3').then(() => {
                        this.calendarApiLoaded = true;
                        console.log('[GoogleCalendarProvider] Calendar API loaded');
                        resolve();
                    });
                }
            }, 100);

            // Timeout after 10 seconds
            setTimeout(() => {
                clearInterval(checkLoaded);
                if (!this.calendarApiLoaded) {
                    console.warn('[GoogleCalendarProvider] Calendar API load timeout');
                }
                resolve();
            }, 10000);
        });
    }

    private ensureAuthenticated(): void {
        if (!this.accessToken) {
            throw new Error('Not authenticated with Google Calendar');
        }
        // Ensure token is set on gapi client
        if (typeof gapi !== 'undefined' && gapi.client) {
            gapi.client.setToken({ access_token: this.accessToken });
        }
    }

    private ensureApiLoaded(): void {
        if (!this.calendarApiLoaded) {
            throw new Error('Google Calendar API not loaded');
        }
    }

    private async getAllEvents(calendarId: string): Promise<CalendarEvent[]> {
        const allEvents: CalendarEvent[] = [];
        let pageToken: string | undefined;

        do {
            const response: any = await gapi.client.calendar.events.list({
                calendarId,
                maxResults: 250,
                pageToken,
            });

            const items = response.result.items || [];
            allEvents.push(...items.map((e: any) => this.mapGoogleEventToCalendarEvent(e)));
            pageToken = response.result.nextPageToken;
        } while (pageToken);

        return allEvents;
    }

    private mapGoogleEventToCalendarEvent(googleEvent: any): CalendarEvent {
        return {
            id: googleEvent.id,
            summary: googleEvent.summary || '',
            description: googleEvent.description,
            location: googleEvent.location,
            start: {
                dateTime: googleEvent.start?.dateTime || googleEvent.start?.date || '',
                timeZone: googleEvent.start?.timeZone || 'America/New_York',
            },
            end: {
                dateTime: googleEvent.end?.dateTime || googleEvent.end?.date || '',
                timeZone: googleEvent.end?.timeZone || 'America/New_York',
            },
            recurrence: googleEvent.recurrence,
            colorId: googleEvent.colorId,
        };
    }

    private mapCalendarEventToGoogleEvent(event: CalendarEvent): any {
        return {
            summary: event.summary,
            description: event.description,
            location: event.location,
            start: {
                dateTime: event.start.dateTime,
                timeZone: event.start.timeZone,
            },
            end: {
                dateTime: event.end.dateTime,
                timeZone: event.end.timeZone,
            },
            recurrence: event.recurrence,
            colorId: event.colorId,
        };
    }
}
