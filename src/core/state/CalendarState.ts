// =============================================================================
// CalendarState - Centralized calendar state management
// =============================================================================

import type { ConnectedCalendar, CalendarEvent } from '../../services/calendar/types';
import type { BlockedTimePeriod } from '../../types/schedule';
import { calendarEventToBlockedTime } from '../../services/calendar/types';
import { calendarService } from '../../services/calendar/CalendarService';

/**
 * Callback for when exclusions change
 */
type ExclusionChangeCallback = () => void;

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

    // Blocked times (pre-computed per term)
    private blockedTimesCache: Map<string, BlockedTimePeriod[]> = new Map();
    private blockedTimesDirty: boolean = true;

    // Callbacks
    private exclusionChangeCallbacks: ExclusionChangeCallback[] = [];

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
        this.blockedTimesDirty = true;
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
        this.blockedTimesDirty = true;
    }

    /**
     * Clear all events and reset state
     */
    clearEvents(): void {
        this.connectedCalendar = null;
        this.eventInstances.clear();
        this.eventParents.clear();
        this.excludedEventIds.clear();
        this.blockedTimesCache.clear();
        this.blockedTimesDirty = true;
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
            this.blockedTimesDirty = true;
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
            this.blockedTimesDirty = true;
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
            this.blockedTimesDirty = true;
            this.notifyExclusionChange();
        }
    }

    /**
     * Collect all event IDs (for hideAll)
     */
    private collectAllEventIds(): Set<string> {
        const ids = new Set<string>();
        for (const events of this.eventParents.values()) {
            for (const event of events) {
                if (event.id) ids.add(event.id);
            }
        }
        return ids;
    }

    // -------------------------------------------------------------------------
    // Blocked Times (for Auto-Scheduler)
    // -------------------------------------------------------------------------

    /**
     * Get blocked times for a specific term
     */
    getBlockedTimesForTerm(term: string): BlockedTimePeriod[] {
        this.ensureBlockedTimesComputed();
        return this.blockedTimesCache.get(term) || [];
    }

    /**
     * Get all blocked times across all terms
     */
    getAllBlockedTimes(): BlockedTimePeriod[] {
        this.ensureBlockedTimesComputed();
        const allTimes: BlockedTimePeriod[] = [];
        for (const times of this.blockedTimesCache.values()) {
            allTimes.push(...times);
        }
        return allTimes;
    }

    /**
     * Get count of events that will be blocked (non-excluded, weekday events)
     */
    getBlockableEventCount(): number {
        this.ensureBlockedTimesComputed();
        let count = 0;
        for (const times of this.blockedTimesCache.values()) {
            count += times.length;
        }
        return count;
    }

    /**
     * Ensure blocked times are computed (lazy computation)
     */
    private ensureBlockedTimesComputed(): void {
        if (!this.blockedTimesDirty) return;
        this.computeBlockedTimes();
        this.blockedTimesDirty = false;
    }

    /**
     * Compute blocked times from events.
     * Handles rrule deduplication - recurring events expand to many instances
     * with the same day/time, so we deduplicate by term+day+time.
     */
    private computeBlockedTimes(): void {
        this.blockedTimesCache.clear();

        // For each term in eventInstances
        for (const [term, events] of this.eventInstances) {
            const termBlockedTimes: BlockedTimePeriod[] = [];
            const seenKeys = new Set<string>(); // For deduplication

            for (const event of events) {
                // Skip if excluded (check parentId for recurring, or id for non-recurring)
                const idToCheck = event.parentId || event.id;
                if (idToCheck && this.excludedEventIds.has(idToCheck)) {
                    continue;
                }

                // Convert using calendarEventToBlockedTime()
                const blockedTime = calendarEventToBlockedTime(event, term);
                if (!blockedTime) continue;

                // Deduplicate by term+day+startTime+endTime
                // This is critical for rrule events which expand to many instances
                // with the same day/time but different dates
                const key = `${term}-${blockedTime.day}-${blockedTime.startTime.hours}:${blockedTime.startTime.minutes}-${blockedTime.endTime.hours}:${blockedTime.endTime.minutes}`;
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);

                termBlockedTimes.push(blockedTime);
            }

            this.blockedTimesCache.set(term, termBlockedTimes);
        }
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
}
