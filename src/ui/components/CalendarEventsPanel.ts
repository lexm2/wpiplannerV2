// =============================================================================
// Calendar Events Panel - Manage external calendar event visibility
// =============================================================================

import type { CalendarEvent } from '../../services/calendar';
import { BaseSidebarPanel } from '../sidebar/BaseSidebarPanel';
import { getInlineSVG } from '../../utils/iconPaths';
import { Validators } from '../../utils/validators';

export interface CalendarEventsPanelOptions {
    calendarName: string;
    events: Map<string, CalendarEvent[]>; // term -> events
    excludedEventIds: Set<string>;
    onExclusionChange: (eventId: string, excluded: boolean) => void;
    onShowAll: () => void;
    onHideAll: () => void;
    onClose: () => void;
}

/**
 * Sidebar panel for managing external calendar event visibility.
 * Users can click events to toggle their visibility on the schedule grid.
 * Extends BaseSidebarPanel for consistent panel behavior.
 */
export class CalendarEventsPanel extends BaseSidebarPanel {
    readonly panelId = 'calendar-events';
    readonly panelClass = 'calendar-panel-active';

    private panelOptions: CalendarEventsPanelOptions;
    /** Local copy of events to avoid being affected by external Map clearing */
    private eventsCopy: Map<string, CalendarEvent[]>;

    constructor(options: CalendarEventsPanelOptions) {
        super({
            containerId: 'schedule-sidebar-content',
            animationDuration: 250,
            escapeToClose: true,
            animationType: 'slide-right',
        });
        this.panelOptions = options;

        // Deep copy the events Map so we're not affected by external clears
        this.eventsCopy = new Map();
        for (const [term, events] of options.events) {
            this.eventsCopy.set(term, [...events]);
        }
    }

    // =========================================================================
    // Public Methods
    // =========================================================================

    /**
     * Update the excluded IDs with targeted DOM updates (no full re-render).
     * This preserves event listeners and provides smoother UI updates.
     */
    updateExcludedIds(excludedIds: Set<string>): void {
        const previousExcluded = this.panelOptions.excludedEventIds;
        this.panelOptions.excludedEventIds = excludedIds;

        if (!this.panel) return;

        // Find all changed event IDs
        const changedIds = new Set<string>();
        for (const id of excludedIds) {
            if (!previousExcluded.has(id)) changedIds.add(id);
        }
        for (const id of previousExcluded) {
            if (!excludedIds.has(id)) changedIds.add(id);
        }

        // Update each changed event item
        for (const eventId of changedIds) {
            this.updateEventItemVisual(eventId, excludedIds.has(eventId));
        }

        // Update term counts
        this.updateTermCounts();
    }

    /**
     * Update a single event item's visual state (targeted DOM update).
     */
    private updateEventItemVisual(eventId: string, isExcluded: boolean): void {
        if (!this.panel) return;

        const item = this.panel.querySelector<HTMLElement>(`.calendar-event-item[data-event-id="${eventId}"]`);
        if (!item) return;

        // Update excluded class
        if (isExcluded) {
            item.classList.add('excluded');
        } else {
            item.classList.remove('excluded');
        }

        // Update the visibility icon
        const iconContainer = item.querySelector('.event-visibility-toggle');
        if (iconContainer) {
            iconContainer.innerHTML = isExcluded
                ? getInlineSVG('HEXAGON_MINUS', 'visibility-icon hidden')
                : getInlineSVG('HEXAGON_PLUS', 'visibility-icon visible');
        }
    }

    /**
     * Update all term count displays based on current excluded IDs.
     */
    private updateTermCounts(): void {
        if (!this.panel) return;

        const terms = ['A', 'B', 'C', 'D'];
        for (const term of terms) {
            const events = this.eventsCopy.get(term) || [];
            if (events.length === 0) continue;

            const hiddenCount = events.filter(e => e.id && this.panelOptions.excludedEventIds.has(e.id)).length;
            const countText = `${events.length} event${events.length !== 1 ? 's' : ''}${hiddenCount > 0 ? `, ${hiddenCount} hidden` : ''}`;

            // Find the term header and update the count
            const termGroups = this.panel.querySelectorAll('.calendar-term-group');
            for (const group of termGroups) {
                const termLabel = group.querySelector('.term-label');
                if (termLabel?.textContent === `Term ${term}`) {
                    const termCount = group.querySelector('.term-count');
                    if (termCount) {
                        termCount.textContent = countText;
                    }
                    break;
                }
            }
        }
    }

    // =========================================================================
    // BaseSidebarPanel Implementation
    // =========================================================================

    /**
     * Render the full panel content
     */
    protected renderContent(): string {
        const totalEvents = this.getTotalEventCount();

        return `
            <div class="calendar-events-header">
                <div class="calendar-events-title">
                    <span class="calendar-events-icon">${getInlineSVG('CALENDAR_DOWN', 'calendar-icon')}</span>
                    <div class="calendar-events-info">
                        <span class="calendar-name">${Validators.escapeHtml(this.panelOptions.calendarName)}</span>
                        <span class="events-count">${totalEvents} event${totalEvents !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                <div class="calendar-events-actions">
                    <button class="calendar-events-action-btn" id="calendar-show-all-btn" title="Show all events">
                        ${getInlineSVG('HEXAGON_PLUS', 'action-icon')}
                    </button>
                    <button class="calendar-events-action-btn" id="calendar-hide-all-btn" title="Hide all events">
                        ${getInlineSVG('HEXAGON_MINUS', 'action-icon')}
                    </button>
                    <button class="calendar-events-close-btn" title="Close">
                        ${getInlineSVG('X', 'close-icon')}
                    </button>
                </div>
            </div>
            <div class="calendar-events-instructions">
                Click an event to show/hide it on the schedule
            </div>
            <div class="calendar-events-content">
                ${this.renderEventsList()}
            </div>
        `;
    }

    /**
     * Attach click event listeners
     */
    protected attachEventListeners(): void {
        // Close button
        const closeBtn = this.querySelector<HTMLButtonElement>('.calendar-events-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Show all button
        const showAllBtn = this.querySelector<HTMLButtonElement>('#calendar-show-all-btn');
        if (showAllBtn) {
            showAllBtn.addEventListener('click', () => this.panelOptions.onShowAll());
        }

        // Hide all button
        const hideAllBtn = this.querySelector<HTMLButtonElement>('#calendar-hide-all-btn');
        if (hideAllBtn) {
            hideAllBtn.addEventListener('click', () => this.panelOptions.onHideAll());
        }

        // Event items
        const eventItems = this.querySelectorAll<HTMLElement>('.calendar-event-item');
        eventItems.forEach(item => {
            item.addEventListener('click', () => {
                const eventId = item.dataset.eventId;
                if (eventId) {
                    const isCurrentlyExcluded = this.panelOptions.excludedEventIds.has(eventId);
                    this.panelOptions.onExclusionChange(eventId, !isCurrentlyExcluded);
                }
            });
        });
    }

    /**
     * Called when panel closes - invoke the onClose callback
     */
    protected onClose(): void {
        this.panelOptions.onClose();
    }

    // =========================================================================
    // Private Rendering Methods
    // =========================================================================

    /**
     * Render the events list grouped by term
     */
    private renderEventsList(): string {
        const terms = ['A', 'B', 'C', 'D'];
        let html = '';

        for (const term of terms) {
            // Use local eventsCopy instead of panelOptions.events to avoid race conditions
            const events = this.eventsCopy.get(term) || [];
            if (events.length === 0) continue;

            const hiddenCount = events.filter(e => e.id && this.panelOptions.excludedEventIds.has(e.id)).length;

            html += `
                <div class="calendar-term-group">
                    <div class="calendar-term-header">
                        <span class="term-label">Term ${term}</span>
                        <span class="term-count">${events.length} event${events.length !== 1 ? 's' : ''}${hiddenCount > 0 ? `, ${hiddenCount} hidden` : ''}</span>
                    </div>
                    <div class="calendar-term-events">
                        ${events.map(event => this.renderEventItem(event, term)).join('')}
                    </div>
                </div>
            `;
        }

        if (!html) {
            html = '<div class="no-events-message">No calendar events found for any term</div>';
        }

        return html;
    }

    /**
     * Render a single event item (parent event with optional recurrence info)
     */
    private renderEventItem(event: CalendarEvent, term: string): string {
        const isExcluded = event.id ? this.panelOptions.excludedEventIds.has(event.id) : false;
        const eventDate = new Date(event.start.dateTime);
        const dayName = eventDate.toLocaleDateString('en-US', { weekday: 'short' });
        const time = eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const dateStr = eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        // For recurring events, show recurrence description instead of specific date
        const isRecurring = !!event.recurrenceDescription;
        const recurrenceHtml = isRecurring
            ? `<div class="event-recurrence">${Validators.escapeHtml(event.recurrenceDescription!)}</div>`
            : '';

        // Show occurrence count for recurring events
        const occurrenceHtml = event.occurrenceCount && event.occurrenceCount > 1
            ? `<span class="occurrence-count">${event.occurrenceCount} occurrences</span>`
            : '';

        // Show start time and first date (or just time for recurring)
        const datetimeHtml = isRecurring
            ? `<div class="event-datetime">${time}${occurrenceHtml ? ` · ${occurrenceHtml}` : ''}</div>`
            : `<div class="event-datetime">${dayName}, ${dateStr} at ${time}</div>`;

        return `
            <div class="calendar-event-item ${isExcluded ? 'excluded' : ''} ${isRecurring ? 'recurring' : ''}"
                 data-event-id="${event.id || ''}"
                 data-term="${term}">
                <div class="event-visibility-toggle">
                    ${isExcluded
                        ? getInlineSVG('HEXAGON_MINUS', 'visibility-icon hidden')
                        : getInlineSVG('HEXAGON_PLUS', 'visibility-icon visible')
                    }
                </div>
                <div class="event-details">
                    <div class="event-summary">${Validators.escapeHtml(event.summary || 'Untitled Event')}</div>
                    ${recurrenceHtml}
                    ${datetimeHtml}
                </div>
            </div>
        `;
    }

    /**
     * Get total event count across all terms
     */
    private getTotalEventCount(): number {
        let total = 0;
        // Use local eventsCopy instead of panelOptions.events
        for (const events of this.eventsCopy.values()) {
            total += events.length;
        }
        return total;
    }
}
