import { appState } from '../../core/state/appState.svelte';
import { AcademicTerm, EventType } from '../../types/schedule';
import type { WeeklyTimeSlot } from '../../types/schedule';
import type { CalendarEventProvider } from './AutoScheduleOrchestrator';

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
    const visibleEvents = localEvents.filter(e => e.visible);

    for (const event of visibleEvents) {
      if (event.eventType === EventType.ONE_TIME) continue;

      const days = event.days || [];
      const terms = event.terms || [AcademicTerm.ALL];

      for (const term of terms) {
        const academicTerm = term as AcademicTerm;
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
    return (appState.activeSchedule?.localEvents || []).filter(e => e.visible)
      .length;
  },
};
