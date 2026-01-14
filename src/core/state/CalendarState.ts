// =============================================================================
// CalendarState - Centralized calendar state management
// =============================================================================

import type { ConnectedCalendar, CalendarEvent } from '../../services/calendar/types';
import type { WeeklyTimeSlot, DisplayableTimeSlot, LocalCalendarEvent } from '../../types/schedule';
import { AcademicTerm } from '../../types/schedule';
import { DayOfWeek } from '../../types/types';
import { calendarService } from '../../services/calendar/CalendarService';

/**
 * Callback for when exclusions change
 */
type ExclusionChangeCallback = () => void;

/**
 * Callback for when local events change
 */
type LocalEventsChangeCallback = (events: LocalCalendarEvent[]) => void;

/**
 * CalendarState - Single source of truth for all calendar-related state.
 *
 * Manages:
 * - Connected calendar info
 * - Event instances (expanded from rrule) for grid display
 * - Event parents for panel display
 * - Exclusions (which events are hidden)
 * - Pre-computed blocked times for auto-scheduler
 */
export class CalendarState {
    // Connection
    private connectedCalendar: ConnectedCalendar | null = null;

    // Events by term
    private eventInstances: Map<string, CalendarEvent[]> = new Map();
    private eventParents: Map<string, CalendarEvent[]> = new Map();

    // Exclusions
    private excludedEventIds: Set<string> = new Set();

    // Weekly slots (unified representation for display)
    private weeklySlots: Map<string, DisplayableTimeSlot[]> = new Map();
    private weeklySlotsDirty: boolean = true;

    // Callbacks
    private exclusionChangeCallbacks: ExclusionChangeCallback[] = [];
    private localEventsChangeCallbacks: LocalEventsChangeCallback[] = [];

    // Local events (stored per-schedule, not synced to cloud)
    private localEvents: LocalCalendarEvent[] = [];

    // -------------------------------------------------------------------------
    // Connection State
    // -------------------------------------------------------------------------

    /**
     * Check if a calendar is connected
     */
    isConnected(): boolean {
        return this.connectedCalendar !== null;
    }

    /**
     * Get calendar display info
     */
    getCalendarInfo(): { name: string; provider: string } | null {
        if (!this.connectedCalendar) return null;
        return {
            name: this.connectedCalendar.calendarName,
            provider: this.connectedCalendar.providerId
        };
    }

    /**
     * Get the connected calendar object
     */
    getConnectedCalendar(): ConnectedCalendar | null {
        return this.connectedCalendar;
    }

    // -------------------------------------------------------------------------
    // Event Loading
    // -------------------------------------------------------------------------

    /**
     * Load events for a connected calendar.
     * Fetches events from calendarService and populates instances/parents.
     */
    async loadEvents(calendar: ConnectedCalendar): Promise<void> {
        // 1. Store connected calendar
        this.connectedCalendar = calendar;

        // 2. Fetch events from calendarService.getEventsForAllTerms()
        const { instances, parents } = await calendarService.getEventsForAllTerms(calendar);

        // 3. Store instances and parents
        this.eventInstances = instances;
        this.eventParents = parents;

        // 4. Load exclusions from calendar.excludedEventIds
        this.excludedEventIds = new Set(calendar.excludedEventIds || []);

        // 5. Mark blocked times as dirty
        this.weeklySlotsDirty = true;
    }

    /**
     * Set events directly (for migration from ScheduleController)
     */
    setEvents(
        calendar: ConnectedCalendar,
        instances: Map<string, CalendarEvent[]>,
        parents: Map<string, CalendarEvent[]>
    ): void {
        this.connectedCalendar = calendar;
        this.eventInstances = instances;
        this.eventParents = parents;
        this.excludedEventIds = new Set(calendar.excludedEventIds || []);
        this.weeklySlotsDirty = true;
    }

    /**
     * Clear all events and reset state
     */
    clearEvents(): void {
        this.connectedCalendar = null;
        this.eventInstances.clear();
        this.eventParents.clear();
        this.excludedEventIds.clear();
        this.weeklySlots.clear();
        this.weeklySlotsDirty = true;
    }

    // -------------------------------------------------------------------------
    // Event Access
    // -------------------------------------------------------------------------

    /**
     * Get expanded event instances for a term (for grid display)
     */
    getInstancesForTerm(term: string): CalendarEvent[] {
        return this.eventInstances.get(term) || [];
    }

    /**
     * Get all instances grouped by term
     */
    getAllInstances(): Map<string, CalendarEvent[]> {
        return this.eventInstances;
    }

    /**
     * Get parent events for a term (for panel display)
     */
    getParentsForTerm(term: string): CalendarEvent[] {
        return this.eventParents.get(term) || [];
    }

    /**
     * Get all parents grouped by term
     */
    getAllParents(): Map<string, CalendarEvent[]> {
        return this.eventParents;
    }

    // -------------------------------------------------------------------------
    // Exclusions
    // -------------------------------------------------------------------------

    /**
     * Check if an event is excluded
     */
    isExcluded(eventId: string): boolean {
        return this.excludedEventIds.has(eventId);
    }

    /**
     * Set an event's exclusion status
     */
    setExcluded(eventId: string, excluded: boolean): void {
        const changed = excluded
            ? !this.excludedEventIds.has(eventId)
            : this.excludedEventIds.has(eventId);

        if (excluded) {
            this.excludedEventIds.add(eventId);
        } else {
            this.excludedEventIds.delete(eventId);
        }

        if (changed) {
            this.weeklySlotsDirty = true;
            this.notifyExclusionChange();
        }
    }

    /**
     * Get all excluded event IDs
     */
    getExcludedIds(): Set<string> {
        return new Set(this.excludedEventIds);
    }

    /**
     * Get excluded IDs as array (for persistence)
     */
    getExcludedIdsArray(): string[] {
        return Array.from(this.excludedEventIds);
    }

    /**
     * Show all events (clear exclusions)
     */
    showAll(): void {
        if (this.excludedEventIds.size > 0) {
            this.excludedEventIds.clear();
            this.weeklySlotsDirty = true;
            this.notifyExclusionChange();
        }
    }

    /**
     * Hide all events (exclude all)
     */
    hideAll(): void {
        const allIds = this.collectAllEventIds();
        const hadChanges = allIds.size !== this.excludedEventIds.size;

        this.excludedEventIds = allIds;

        if (hadChanges) {
            this.weeklySlotsDirty = true;
            this.notifyExclusionChange();
        }
    }

    /**
     * Collect all unique event IDs from parents (for validation and hideAll)
     */
    collectAllEventIds(): Set<string> {
        const ids = new Set<string>();
        for (const events of this.eventParents.values()) {
            for (const event of events) {
                if (event.id) ids.add(event.id);
            }
        }
        return ids;
    }

    /**
     * Set excluded IDs directly (for loading from schedule)
     */
    setExcludedIds(ids: string[]): void {
        this.excludedEventIds = new Set(ids);
        this.weeklySlotsDirty = true;
    }

    /**
     * Get filtered, deduplicated instances for grid display.
     * Filters out excluded events and deduplicates recurring events
     * (same parentId + day + time).
     * @deprecated Use getWeeklySlotsForTerm() instead
     */
    getFilteredInstancesForTerm(term: string): CalendarEvent[] {
        const instances = this.eventInstances.get(term) || [];

        // Filter excluded
        const filtered = instances.filter(event => {
            const idToCheck = event.parentId || event.id;
            return !idToCheck || !this.excludedEventIds.has(idToCheck);
        });

        // Deduplicate recurring events (same parentId + day + time)
        const seen = new Set<string>();
        return filtered.filter(event => {
            const startDate = new Date(event.start.dateTime);
            const key = `${event.parentId || event.id}-${startDate.getDay()}-${startDate.getHours()}:${startDate.getMinutes()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    // -------------------------------------------------------------------------
    // Weekly Slots (Unified Display Representation)
    // -------------------------------------------------------------------------

    /**
     * Get weekly time slots for a term (for grid display).
     * Returns deduplicated, non-excluded events as DisplayableTimeSlot objects.
     */
    getWeeklySlotsForTerm(term: string): DisplayableTimeSlot[] {
        this.ensureWeeklySlotsComputed();
        return this.weeklySlots.get(term) || [];
    }

    /**
     * Get all weekly slots across all terms.
     */
    getAllWeeklySlots(): Map<string, DisplayableTimeSlot[]> {
        this.ensureWeeklySlotsComputed();
        return this.weeklySlots;
    }

    /**
     * Ensure weekly slots are computed (lazy computation).
     */
    private ensureWeeklySlotsComputed(): void {
        if (!this.weeklySlotsDirty) return;
        this.computeWeeklySlots();
        this.weeklySlotsDirty = false;
    }

    /**
     * Compute weekly slots from event instances.
     * Merges both cloud calendar events and local calendar events.
     * Handles deduplication and exclusion filtering.
     */
    private computeWeeklySlots(): void {
        this.weeklySlots.clear();

        // Phase 1: Process cloud calendar events
        for (const [term, events] of this.eventInstances) {
            const slots: DisplayableTimeSlot[] = [];
            const seen = new Set<string>(); // Dedupe key

            for (const event of events) {
                // Skip excluded
                const idToCheck = event.parentId || event.id;
                if (idToCheck && this.excludedEventIds.has(idToCheck)) continue;

                const slot = this.eventToWeeklySlot(event, term);
                if (!slot) continue;

                // Dedupe by day+startTime+endTime (recurring events)
                const key = `${slot.day}-${slot.startTime.hours}:${slot.startTime.minutes}-${slot.endTime.hours}:${slot.endTime.minutes}`;
                if (seen.has(key)) continue;
                seen.add(key);

                slots.push(slot);
            }

            this.weeklySlots.set(term, slots);
        }

        // Phase 2: Add local calendar events to weeklySlots
        const terms = ['A', 'B', 'C', 'D'];
        for (const term of terms) {
            const existingSlots = this.weeklySlots.get(term) || [];
            const localSlots = this.getLocalEventSlotsForTerm(term);

            // Merge: existing cloud slots + local slots
            // getLocalEventSlotsForTerm() already filters by:
            //   - visible: true
            //   - term applicability
            const allSlots = [...existingSlots, ...localSlots];

            this.weeklySlots.set(term, allSlots);
        }
    }

    /**
     * Convert a CalendarEvent to a DisplayableTimeSlot.
     * Returns null if the event is on a weekend or invalid.
     */
    private eventToWeeklySlot(event: CalendarEvent, term: string): DisplayableTimeSlot | null {
        const startDate = new Date(event.start.dateTime);
        const endDate = new Date(event.end.dateTime);
        const dayIndex = startDate.getDay();

        // Skip weekends
        if (dayIndex === 0 || dayIndex === 6) return null;

        const dayMap: Record<number, DayOfWeek> = {
            1: DayOfWeek.MONDAY,
            2: DayOfWeek.TUESDAY,
            3: DayOfWeek.WEDNESDAY,
            4: DayOfWeek.THURSDAY,
            5: DayOfWeek.FRIDAY
        };
        const day = dayMap[dayIndex];
        if (!day) return null;

        const termMap: Record<string, AcademicTerm> = {
            'A': AcademicTerm.A,
            'B': AcademicTerm.B,
            'C': AcademicTerm.C,
            'D': AcademicTerm.D
        };
        const academicTerm = termMap[term];
        if (!academicTerm) return null;

        return {
            id: `cal-${event.id || event.parentId}-${day}`,
            day,
            startTime: { hours: startDate.getHours(), minutes: startDate.getMinutes() },
            endTime: { hours: endDate.getHours(), minutes: endDate.getMinutes() },
            term: academicTerm,
            title: event.summary,
            subtitle: event.location,
            sourceType: 'calendar',
            sourceId: event.id || event.parentId,
        };
    }

    // -------------------------------------------------------------------------
    // Blocked Times (for Auto-Scheduler)
    // -------------------------------------------------------------------------

    /**
     * Get blocked times for a specific term.
     * Returns WeeklyTimeSlot[] (DisplayableTimeSlot extends WeeklyTimeSlot).
     */
    getBlockedTimesForTerm(term: string): WeeklyTimeSlot[] {
        this.ensureWeeklySlotsComputed();
        return this.weeklySlots.get(term) || [];
    }

    /**
     * Get all blocked times across all terms.
     * Returns WeeklyTimeSlot[] (DisplayableTimeSlot extends WeeklyTimeSlot).
     *
     * Includes BOTH:
     * - Cloud calendar events (from connected calendar, non-excluded, weekdays only)
     * - Local calendar events (stored locally, visible only, weekdays only)
     */
    getAllBlockedTimes(): WeeklyTimeSlot[] {
        this.ensureWeeklySlotsComputed();
        const allTimes: WeeklyTimeSlot[] = [];
        for (const times of this.weeklySlots.values()) {
            allTimes.push(...times);
        }
        return allTimes;
    }

    /**
     * Get count of events that will be blocked during auto-scheduling.
     * Includes both cloud calendar events (non-excluded) and visible local events.
     * Count automatically reflects weeklySlots contents after computeWeeklySlots().
     */
    getBlockableEventCount(): number {
        this.ensureWeeklySlotsComputed();
        let count = 0;
        for (const times of this.weeklySlots.values()) {
            count += times.length;
        }
        return count;
    }

    // -------------------------------------------------------------------------
    // Callbacks
    // -------------------------------------------------------------------------

    /**
     * Register callback for exclusion changes
     */
    onExclusionChange(callback: ExclusionChangeCallback): void {
        this.exclusionChangeCallbacks.push(callback);
    }

    /**
     * Remove exclusion change callback
     */
    offExclusionChange(callback: ExclusionChangeCallback): void {
        const index = this.exclusionChangeCallbacks.indexOf(callback);
        if (index !== -1) {
            this.exclusionChangeCallbacks.splice(index, 1);
        }
    }

    /**
     * Notify all exclusion change listeners
     */
    private notifyExclusionChange(): void {
        for (const callback of this.exclusionChangeCallbacks) {
            callback();
        }
    }

    // -------------------------------------------------------------------------
    // Local Events (stored locally, not synced to cloud)
    // -------------------------------------------------------------------------

    /**
     * Set all local events (typically called when loading a schedule)
     */
    setLocalEvents(events: LocalCalendarEvent[]): void {
        this.localEvents = [...events];
        this.weeklySlotsDirty = true;
        this.notifyLocalEventsChange();
    }

    /**
     * Get all local events
     */
    getLocalEvents(): LocalCalendarEvent[] {
        return [...this.localEvents];
    }

    /**
     * Get local events for a specific term
     */
    getLocalEventsForTerm(term: string): LocalCalendarEvent[] {
        return this.localEvents.filter(e => this.eventAppliesToTerm(e, term));
    }

    /**
     * Get visible local events for a term (for grid display)
     */
    getVisibleLocalEventsForTerm(term: string): LocalCalendarEvent[] {
        return this.localEvents.filter(e => e.visible && this.eventAppliesToTerm(e, term));
    }

    /**
     * Check if an event applies to a given term
     */
    private eventAppliesToTerm(event: LocalCalendarEvent, term: string): boolean {
        if (event.eventType === 'one-time') {
            // One-time events: check if date falls within term
            return this.isDateInTerm(event.date, term);
        } else {
            // Recurring events: check terms array
            return event.terms?.includes(term) ?? false;
        }
    }

    /**
     * Check if a date string (YYYY-MM-DD) falls within a term
     */
    private isDateInTerm(dateStr: string | undefined, term: string): boolean {
        if (!dateStr) return false;

        const date = new Date(dateStr);
        const year = date.getFullYear();
        const termDates = this.getTermDates(term, year);
        if (!termDates) return false;

        return date >= termDates.start && date <= termDates.end;
    }

    /**
     * Get term start/end dates for a given academic year
     */
    private getTermDates(term: string, year: number): { start: Date, end: Date } | null {
        // Term dates (month is 0-indexed)
        // A: Late Aug - Mid Oct
        // B: Late Oct - Mid Dec
        // C: Early Jan - Early Mar (next year)
        // D: Mid Mar - Early May (next year)
        switch (term.charAt(0).toUpperCase()) {
            case 'A':
                return {
                    start: new Date(year, 7, 25), // Aug 25
                    end: new Date(year, 9, 13)    // Oct 13
                };
            case 'B':
                return {
                    start: new Date(year, 9, 21),  // Oct 21
                    end: new Date(year, 11, 13)    // Dec 13
                };
            case 'C':
                return {
                    start: new Date(year, 0, 6),   // Jan 6
                    end: new Date(year, 2, 7)      // Mar 7
                };
            case 'D':
                return {
                    start: new Date(year, 2, 17),  // Mar 17
                    end: new Date(year, 4, 9)      // May 9
                };
            default:
                return null;
        }
    }

    /**
     * Get day of week from date string
     */
    private getDayOfWeekFromDate(dateStr: string): DayOfWeek | null {
        const date = new Date(dateStr);
        const dayIndex = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const dayMap: Record<number, DayOfWeek> = {
            0: DayOfWeek.SUNDAY,
            1: DayOfWeek.MONDAY,
            2: DayOfWeek.TUESDAY,
            3: DayOfWeek.WEDNESDAY,
            4: DayOfWeek.THURSDAY,
            5: DayOfWeek.FRIDAY,
            6: DayOfWeek.SATURDAY
        };
        return dayMap[dayIndex] ?? null;
    }

    /**
     * Add a new local event
     */
    addLocalEvent(event: LocalCalendarEvent): void {
        this.localEvents.push(event);
        this.weeklySlotsDirty = true;
        this.notifyLocalEventsChange();
    }

    /**
     * Update an existing local event
     */
    updateLocalEvent(id: string, updates: Partial<LocalCalendarEvent>): void {
        const index = this.localEvents.findIndex(e => e.id === id);
        if (index === -1) return;

        const existing = this.localEvents[index];
        const updated: LocalCalendarEvent = {
            ...existing,
            ...updates,
            updatedAt: Date.now()
        };

        // Clear type-specific fields when switching event types
        if (updated.eventType === 'one-time') {
            // One-time events don't have days/terms
            delete (updated as Partial<LocalCalendarEvent>).days;
            delete (updated as Partial<LocalCalendarEvent>).day;
            delete (updated as Partial<LocalCalendarEvent>).terms;
        } else {
            // Recurring events don't have date
            delete (updated as Partial<LocalCalendarEvent>).date;
        }

        this.localEvents[index] = updated;
        this.weeklySlotsDirty = true;
        this.notifyLocalEventsChange();
    }

    /**
     * Delete a local event
     */
    deleteLocalEvent(id: string): void {
        const index = this.localEvents.findIndex(e => e.id === id);
        if (index === -1) return;

        this.localEvents.splice(index, 1);
        this.weeklySlotsDirty = true;
        this.notifyLocalEventsChange();
    }

    /**
     * Toggle visibility of a local event
     */
    toggleLocalEventVisibility(id: string): void {
        const event = this.localEvents.find(e => e.id === id);
        if (!event) return;

        event.visible = !event.visible;
        event.updatedAt = Date.now();
        this.weeklySlotsDirty = true;
        this.notifyLocalEventsChange();
    }

    /**
     * Get local events as weekly slots for grid display
     */
    getLocalEventSlotsForTerm(term: string): DisplayableTimeSlot[] {
        const events = this.getVisibleLocalEventsForTerm(term);
        const slots: DisplayableTimeSlot[] = [];

        for (const event of events) {
            if (event.eventType === 'one-time') {
                // One-time event: single slot on the date's day of week
                const slot = this.oneTimeEventToSlot(event, term);
                if (slot) slots.push(slot);
            } else {
                // Recurring event: create a slot for each day in the days array
                const days = event.days || (event.day ? [event.day] : []);
                for (const day of days) {
                    const slot = this.recurringEventToSlot(event, day, term);
                    if (slot) slots.push(slot);
                }
            }
        }

        return slots;
    }

    /**
     * Convert a one-time LocalCalendarEvent to a DisplayableTimeSlot
     */
    private oneTimeEventToSlot(event: LocalCalendarEvent, term: string): DisplayableTimeSlot | null {
        if (!event.date) return null;

        const day = this.getDayOfWeekFromDate(event.date);
        if (!day) return null;

        const termMap: Record<string, AcademicTerm> = {
            'A': AcademicTerm.A,
            'B': AcademicTerm.B,
            'C': AcademicTerm.C,
            'D': AcademicTerm.D
        };
        const academicTerm = termMap[term];
        if (!academicTerm) return null;

        return {
            id: `local-${event.id}`,
            day,
            startTime: event.startTime,
            endTime: event.endTime,
            term: academicTerm,
            title: event.title,
            subtitle: event.description,
            sourceType: 'blocked',
            sourceId: event.id,
        };
    }

    /**
     * Convert a recurring LocalCalendarEvent to a DisplayableTimeSlot for a specific day
     */
    private recurringEventToSlot(event: LocalCalendarEvent, day: DayOfWeek, term: string): DisplayableTimeSlot | null {
        const termMap: Record<string, AcademicTerm> = {
            'A': AcademicTerm.A,
            'B': AcademicTerm.B,
            'C': AcademicTerm.C,
            'D': AcademicTerm.D
        };
        const academicTerm = termMap[term];
        if (!academicTerm) return null;

        return {
            id: `local-${event.id}-${day}`,
            day,
            startTime: event.startTime,
            endTime: event.endTime,
            term: academicTerm,
            title: event.title,
            subtitle: event.description,
            sourceType: 'blocked',
            sourceId: event.id,
        };
    }

    /**
     * Register callback for local events changes
     */
    onLocalEventsChange(callback: LocalEventsChangeCallback): void {
        this.localEventsChangeCallbacks.push(callback);
    }

    /**
     * Remove local events change callback
     */
    offLocalEventsChange(callback: LocalEventsChangeCallback): void {
        const index = this.localEventsChangeCallbacks.indexOf(callback);
        if (index !== -1) {
            this.localEventsChangeCallbacks.splice(index, 1);
        }
    }

    /**
     * Notify all local events change listeners
     */
    private notifyLocalEventsChange(): void {
        for (const callback of this.localEventsChangeCallbacks) {
            callback(this.localEvents);
        }
    }

    /**
     * Clear local events
     */
    clearLocalEvents(): void {
        this.localEvents = [];
        this.weeklySlotsDirty = true;
        this.notifyLocalEventsChange();
    }
}
