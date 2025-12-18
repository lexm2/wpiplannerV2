// =============================================================================
// Calendar Service - Public API
// =============================================================================

// Types
export type {
    CalendarEvent,
    EventDateTime,
    CalendarInfo,
    CalendarExportOptions,
    CalendarExportResult,
    CalendarProvider,
    TermDates,
    ConnectedCalendar,
} from './types';

export { DAY_TO_RRULE, calendarEventToWeeklySlot } from './types';

// Service
export { CalendarService, calendarService } from './CalendarService';

// State - now in core/state
// export { CalendarState } from '../../core/state/CalendarState';

// Providers
export { GoogleCalendarProvider } from './providers/google/GoogleCalendarProvider';
