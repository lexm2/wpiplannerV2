// =============================================================================
// RRULE Expander - Expands recurring calendar events into individual instances
// =============================================================================

import { RRule } from 'rrule';
import type { CalendarEvent } from './types';

/**
 * Result of expanding recurring events.
 * Contains both expanded instances (for grid rendering) and parent events (for panel display).
 */
export interface ExpandedEventsResult {
    /** Individual event instances for grid placement */
    instances: CalendarEvent[];
    /** Parent events with recurrence info for panel display */
    parents: CalendarEvent[];
}

/**
 * Generate human-readable description from RRULE string.
 * Examples:
 * - "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR" → "Weekly on Monday, Wednesday, Friday"
 * - "RRULE:FREQ=DAILY" → "Every day"
 * - "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU" → "Every 2 weeks on Tuesday"
 */
export function describeRecurrence(rruleStr: string | undefined): string | undefined {
    if (!rruleStr) return undefined;

    try {
        const ruleOptions = RRule.parseString(rruleStr.replace('RRULE:', ''));
        const rule = new RRule(ruleOptions);
        return rule.toText();
    } catch (error) {
        console.warn('[RRuleExpander] Failed to describe RRULE:', rruleStr, error);
        return undefined;
    }
}

/**
 * Expands recurring events into individual instances within a date range.
 * Non-recurring events are passed through unchanged.
 *
 * Recurring event instances preserve the original event ID as `parentId`,
 * allowing exclusion of all instances by excluding the parent.
 *
 * @param events - Calendar events to process (may include recurring events)
 * @param rangeStart - Start of the date range to expand into
 * @param rangeEnd - End of the date range to expand into
 * @returns Object with instances (for grid) and parents (for panel)
 */
export function expandRecurringEvents(
    events: CalendarEvent[],
    rangeStart: Date,
    rangeEnd: Date
): ExpandedEventsResult {
    const instances: CalendarEvent[] = [];
    const parents: CalendarEvent[] = [];

    for (const event of events) {
        if (!event.recurrence?.length) {
            // Non-recurring event - add to both instances and parents as-is
            instances.push(event);
            parents.push({
                ...event,
                occurrenceCount: 1,
            });
            continue;
        }

        // Expand recurring event into individual instances
        const expandedInstances = expandSingleEvent(event, rangeStart, rangeEnd);
        instances.push(...expandedInstances);

        // Create parent event with recurrence description and count
        if (expandedInstances.length > 0) {
            const rruleStr = event.recurrence?.find(r => r.startsWith('RRULE:'));
            parents.push({
                ...event,
                recurrenceDescription: describeRecurrence(rruleStr),
                occurrenceCount: expandedInstances.length,
            });
        }
    }

    return { instances, parents };
}

/**
 * Expands a single recurring event into its instances within a date range.
 *
 * @param event - The recurring event with RRULE recurrence pattern
 * @param rangeStart - Start of the date range
 * @param rangeEnd - End of the date range
 * @returns Array of event instances, each with parentId set to original event ID
 */
function expandSingleEvent(
    event: CalendarEvent,
    rangeStart: Date,
    rangeEnd: Date
): CalendarEvent[] {
    // Find the RRULE string in the recurrence array
    const rruleStr = event.recurrence?.find(r => r.startsWith('RRULE:'));
    if (!rruleStr) {
        // No valid RRULE found, return event as-is
        return [event];
    }

    // Handle all-day events (date only, no dateTime)
    const eventStartStr = event.start.dateTime;
    if (!eventStartStr) {
        // All-day event without dateTime - return as-is for now
        return [event];
    }

    const eventStart = new Date(eventStartStr);
    const eventEnd = new Date(event.end.dateTime);
    const duration = eventEnd.getTime() - eventStart.getTime();

    try {
        // Parse the RRULE string and create rule with event's start date
        const ruleOptions = RRule.parseString(rruleStr.replace('RRULE:', ''));
        ruleOptions.dtstart = eventStart;

        const rule = new RRule(ruleOptions);

        // Get all occurrences within the date range (inclusive)
        const occurrences = rule.between(rangeStart, rangeEnd, true);

        if (occurrences.length === 0) {
            // No occurrences in range - event might be outside the term
            return [];
        }

        // Create an event instance for each occurrence
        return occurrences.map(instanceStart => ({
            ...event,
            parentId: event.id,  // Preserve original ID for exclusion tracking
            start: {
                dateTime: instanceStart.toISOString(),
                timeZone: event.start.timeZone,
            },
            end: {
                dateTime: new Date(instanceStart.getTime() + duration).toISOString(),
                timeZone: event.end.timeZone,
            },
            // Clear recurrence on instances - they're no longer recurring
            recurrence: undefined,
        }));
    } catch (error) {
        console.warn('[RRuleExpander] Failed to parse RRULE:', rruleStr, error);
        // On parse error, return original event
        return [event];
    }
}
