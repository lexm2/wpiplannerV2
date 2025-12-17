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
} from './types';

export { DAY_TO_RRULE } from './types';

// Service
export { CalendarService, calendarService } from './CalendarService';

// Providers
export { GoogleCalendarProvider } from './providers/google/GoogleCalendarProvider';
