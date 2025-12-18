// =============================================================================
// CalendarState - Centralized calendar state management
// =============================================================================

import type { ConnectedCalendar, CalendarEvent } from '../../services/calendar/types';
import type { BlockedTimePeriod, WeeklyTimeSlot } from '../../types/schedule';
import { AcademicTerm } from '../../types/schedule';
import { DayOfWeek } from '../../types/types';
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

    // Weekly slots (unified representation for display)
    private weeklySlots: Map<string, WeeklyTimeSlot[]> = new Map();
    private weeklySlotsDirty: boolean = true;

    // Blocked times (derived from weekly slots)
    private blockedTimesCache: Map<string, BlockedTimePeriod[]> = new Map();

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
        this.blockedTimesCache.clear();
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
     * Returns deduplicated, non-excluded events as WeeklyTimeSlot objects.
     */
    getWeeklySlotsForTerm(term: string): WeeklyTimeSlot[] {
        this.ensureWeeklySlotsComputed();
        return this.weeklySlots.get(term) || [];
    }

    /**
     * Get all weekly slots across all terms.
     */
    getAllWeeklySlots(): Map<string, WeeklyTimeSlot[]> {
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
     * Handles deduplication and exclusion filtering.
     */
    private computeWeeklySlots(): void {
        this.weeklySlots.clear();

        for (const [term, events] of this.eventInstances) {
            const slots: WeeklyTimeSlot[] = [];
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

        // Also recompute blocked times (derived from weekly slots)
        this.computeBlockedTimes();
    }

    /**
     * Convert a CalendarEvent to a WeeklyTimeSlot.
     * Returns null if the event is on a weekend or invalid.
     */
    private eventToWeeklySlot(event: CalendarEvent, term: string): WeeklyTimeSlot | null {
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

    /**
     * Convert a WeeklyTimeSlot to a BlockedTimePeriod.
     */
    private weeklySlotToBlockedTime(slot: WeeklyTimeSlot): BlockedTimePeriod {
        return {
            id: slot.id,
            day: slot.day,
            startTime: slot.startTime,
            endTime: slot.endTime,
            term: slot.term,
        };
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
     * Ensure blocked times are computed (lazy computation).
     * Blocked times are derived from weekly slots, so this just ensures
     * weekly slots are computed.
     */
    private ensureBlockedTimesComputed(): void {
        this.ensureWeeklySlotsComputed();
    }

    /**
     * Compute blocked times from weekly slots.
     * Since weekly slots are already deduplicated and filtered,
     * this is a simple conversion.
     */
    private computeBlockedTimes(): void {
        this.blockedTimesCache.clear();

        for (const [term, slots] of this.weeklySlots) {
            const blockedTimes = slots.map(slot => this.weeklySlotToBlockedTime(slot));
            this.blockedTimesCache.set(term, blockedTimes);
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
