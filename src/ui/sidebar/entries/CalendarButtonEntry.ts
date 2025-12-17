// =============================================================================
// Calendar Button Entry - Sidebar entry for external calendar events button
// =============================================================================

import type { SidebarEntry, CalendarButtonEntryOptions } from '../types';
import { getInlineSVG } from '../../../utils/iconPaths';
import { Validators } from '../../../utils/validators';

/**
 * Data returned by the CalendarButtonEntry
 */
export interface CalendarButtonData {
    calendarName: string;
    totalEvents: number;
    visibleEvents: number;
}

/**
 * Sidebar entry for the external calendar events button.
 * Clicking opens the CalendarEventsPanel.
 */
export class CalendarButtonEntry implements SidebarEntry {
    readonly entryId = 'calendar-events-button';
    readonly entryType = 'calendar';

    private options: CalendarButtonEntryOptions;

    constructor(options: CalendarButtonEntryOptions) {
        this.options = options;
    }

    /**
     * Render the calendar button as HTML
     */
    render(): string {
        const { calendarName, totalEvents, visibleEvents } = this.options;

        return `
            <div class="calendar-events-section" data-entry-id="${this.entryId}">
                <button class="calendar-events-btn" id="calendar-events-btn">
                    <span class="calendar-events-btn-icon">${getInlineSVG('CALENDAR_DOWN', 'calendar-btn-icon')}</span>
                    <span class="calendar-events-btn-info">
                        <span class="calendar-events-btn-name">${Validators.escapeHtml(calendarName)}</span>
                        <span class="calendar-events-btn-count">${visibleEvents} of ${totalEvents} events visible</span>
                    </span>
                </button>
            </div>
        `;
    }

    /**
     * Attach event listeners to the entry elements
     */
    attachListeners(container: HTMLElement): void {
        const button = container.querySelector('#calendar-events-btn');
        if (button && this.options.onClick) {
            button.addEventListener('click', () => {
                this.options.onClick?.();
            });
        }
    }

    /**
     * Get the data associated with this entry
     */
    getData(): CalendarButtonData {
        return {
            calendarName: this.options.calendarName,
            totalEvents: this.options.totalEvents,
            visibleEvents: this.options.visibleEvents,
        };
    }
}
