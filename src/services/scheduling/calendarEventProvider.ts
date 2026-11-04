import { appState } from '../../core/state/appState.svelte';
import { AcademicTerm, EventType } from '../../types/schedule';
import type { LocalCalendarEvent, WeeklyTimeSlot } from '../../types/schedule';
import type { CalendarEventProvider } from './AutoScheduleOrchestrator';

/** Only visible recurring events block time; one-time events block nothing. */
function blocksTime(event: LocalCalendarEvent): boolean {
  return event.visible && event.eventType !== EventType.ONE_TIME;
}

/**
 * Standalone CalendarEventProvider for the auto-scheduler.
 *
 * Reads the active schedule's local events from the `appState.activeSchedule`
 * rune directly. These are on-demand getters called during schedule generation;
 * reading the `$derived` here returns its current value (no reactive tracking).
 */
export const calendarEventProvider: CalendarEventProvider = {
  getAllLocalEventBlockedTimes(): WeeklyTimeSlot[] {
    const localEvents = appState.activeSchedule?.localEvents;
    if (!localEvents) return [];

    const blockedTimes: WeeklyTimeSlot[] = [];
    for (const event of localEvents.filter(blocksTime)) {
      const days = event.days || [];
      const terms = event.terms || [AcademicTerm.ALL];

      for (const term of terms) {
        const academicTerm = term;
        for (const day of days) {
          blockedTimes.push({
            id: `${event.id}-${term}-${day}`,
            day,
            startTime: event.startTime,
            endTime: event.endTime,
            term: academicTerm,
          });
        }
      }
    }

    return blockedTimes;
  },

  getLocalEventCount(): number {
    return (appState.activeSchedule?.localEvents || []).filter(blocksTime)
      .length;
  },
};
