// =============================================================================
// Calendar Events Panel - Manage local and external calendar events
// =============================================================================

import type { CalendarEvent } from '../../services/calendar';
import type { LocalCalendarEvent } from '../../types/schedule';
import { DayOfWeek } from '../../types/types';
import { BaseSidebarPanel } from '../sidebar/BaseSidebarPanel';
import { getInlineSVG } from '../../utils/iconPaths';
import { Validators } from '../../utils/validators';
import styles from '../../styles/components/calendar-events-panel.module.css';

export interface CalendarEventsPanelOptions {
    // External calendar options (optional - may not have connected calendar)
    calendarName?: string;
    events?: Map<string, CalendarEvent[]>; // term -> events
    excludedEventIds?: Set<string>;
    onExclusionChange?: (eventId: string, excluded: boolean) => void;
    onShowAll?: () => void;
    onHideAll?: () => void;
    /** Callback when user clicks to change calendar source */
    onChangeCalendar?: () => void;

    // Local events options
    localEvents: LocalCalendarEvent[];
    onAddLocalEvent: () => void;
    onEditLocalEvent: (id: string) => void;
    onDeleteLocalEvent: (id: string) => void;
    onToggleLocalEventVisibility: (id: string) => void;

    // Common
    onClose: () => void;
}

/**
 * Sidebar panel for managing local and external calendar events.
 * Users can add local events and toggle visibility on the schedule grid.
 * Extends BaseSidebarPanel for consistent panel behavior.
 */
export class CalendarEventsPanel extends BaseSidebarPanel {
    readonly panelId = 'calendar-events';
    readonly panelClass = 'calendar-panel-active';

    private panelOptions: CalendarEventsPanelOptions;
    /** Local copy of external events to avoid being affected by external Map clearing */
    private eventsCopy: Map<string, CalendarEvent[]>;
    /** Local copy of local events */
    private localEventsCopy: LocalCalendarEvent[];
    /** Whether we have external calendar events */
    private hasExternalEvents: boolean;

    constructor(options: CalendarEventsPanelOptions) {
        super({
            containerId: 'schedule-sidebar-content',
            animationDuration: 250,
            escapeToClose: true,
            animationType: 'slide-right',
        });
        this.panelOptions = options;

        // Deep copy the external events Map so we're not affected by external clears
        this.eventsCopy = new Map();
        if (options.events) {
            for (const [term, events] of options.events) {
                this.eventsCopy.set(term, [...events]);
            }
        }
        this.hasExternalEvents = this.eventsCopy.size > 0 && this.getTotalExternalEventCount() > 0;

        // Copy local events
        this.localEventsCopy = [...options.localEvents];
    }

    // =========================================================================
    // Public Methods
    // =========================================================================

    /**
     * Update the excluded IDs with targeted DOM updates (no full re-render).
     * This preserves event listeners and provides smoother UI updates.
     * Used for bulk operations like showAll/hideAll.
     */
    updateExcludedIds(excludedIds: Set<string>): void {
        if (!this.panelOptions.excludedEventIds) return;

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
            this.updateExternalEventItemVisual(eventId, excludedIds.has(eventId));
        }

        // Update term counts
        this.updateExternalTermCounts();
    }

    /**
     * Directly update a single external event's exclusion state.
     * Called by ScheduleController when a specific event is toggled.
     * This mutates the existing Set to ensure click handlers see the updated state.
     */
    updateSingleEventExclusion(eventId: string, excluded: boolean): void {
        if (!this.panelOptions.excludedEventIds) return;

        // Update the internal state by mutating the existing Set
        if (excluded) {
            this.panelOptions.excludedEventIds.add(eventId);
        } else {
            this.panelOptions.excludedEventIds.delete(eventId);
        }

        // Update the visuals
        this.updateExternalEventItemVisual(eventId, excluded);
        this.updateExternalTermCounts();
    }

    /**
     * Update local events list (for re-rendering after add/edit/delete)
     */
    updateLocalEvents(events: LocalCalendarEvent[]): void {
        this.localEventsCopy = [...events];
        this.rerender();
    }

    /**
     * Update a single external event item's visual state (targeted DOM update).
     * Updates ALL instances of this event across terms (for multi-term events).
     */
    private updateExternalEventItemVisual(eventId: string, isExcluded: boolean): void {
        if (!this.panel) return;

        // Use querySelectorAll to update ALL instances of this event across terms
        const items = this.panel.querySelectorAll<HTMLElement>(`.${styles['external-event-item']}[data-event-id="${eventId}"]`);

        items.forEach(item => {
            // Update excluded class
            item.classList.toggle(styles.excluded, isExcluded);

            // Update the visibility icon
            const iconContainer = item.querySelector(`.${styles['event-visibility-toggle']}`);
            if (iconContainer) {
                iconContainer.innerHTML = isExcluded
                    ? getInlineSVG('HEXAGON_MINUS', `${styles['visibility-icon']} ${styles.hidden}`)
                    : getInlineSVG('HEXAGON_PLUS', `${styles['visibility-icon']} ${styles.visible}`);
            }
        });
    }

    /**
     * Update all external term count displays based on current excluded IDs.
     */
    private updateExternalTermCounts(): void {
        if (!this.panel || !this.panelOptions.excludedEventIds) return;

        const terms = ['A', 'B', 'C', 'D'];
        for (const term of terms) {
            const events = this.eventsCopy.get(term) || [];
            if (events.length === 0) continue;

            const hiddenCount = events.filter(e => e.id && this.panelOptions.excludedEventIds!.has(e.id)).length;
            const countText = `${events.length} event${events.length !== 1 ? 's' : ''}${hiddenCount > 0 ? `, ${hiddenCount} hidden` : ''}`;

            // Find the term header and update the count (in external events section)
            const externalSection = this.panel.querySelector(`.${styles['external-events-section']}`);
            if (!externalSection) continue;

            const termGroups = externalSection.querySelectorAll(`.${styles['calendar-term-group']}`);
            for (const group of termGroups) {
                const termLabel = group.querySelector(`.${styles['term-label']}`);
                if (termLabel?.textContent === `Term ${term}`) {
                    const termCount = group.querySelector(`.${styles['term-count']}`);
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
        const totalLocalEvents = this.localEventsCopy.length;
        const totalExternalEvents = this.getTotalExternalEventCount();
        const totalEvents = totalLocalEvents + totalExternalEvents;

        return `
            <div class="${styles['calendar-events-header']}">
                <div class="${styles['calendar-events-title']}">
                    <span class="${styles['calendar-events-icon']}">${getInlineSVG('CALENDAR_DOWN', 'calendar-icon')}</span>
                    <div class="${styles['calendar-events-info']}">
                        <span class="${styles['calendar-name']}">Calendar Events</span>
                        <span class="${styles['events-count']}">${totalEvents} event${totalEvents !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                <div class="${styles['calendar-events-actions']}">
                    <button class="${styles['calendar-events-action-btn']}" id="add-local-event-btn" title="Add event">
                        ${getInlineSVG('PLUS', 'action-icon')}
                    </button>
                    <button class="${styles['calendar-events-close-btn']}" title="Close">
                        ${getInlineSVG('X', 'close-icon')}
                    </button>
                </div>
            </div>
            <div class="${styles['calendar-events-instructions']}">
                Add events to block time on your schedule
            </div>
            <div class="${styles['calendar-events-content']}">
                ${this.renderLocalEventsSection()}
                ${this.renderExternalEventsSection()}
            </div>
        `;
    }

    /**
     * Attach click event listeners
     */
    protected attachEventListeners(): void {
        // Close button
        const closeBtn = this.querySelector<HTMLButtonElement>(`.${styles['calendar-events-close-btn']}`);
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Add local event button
        const addBtn = this.querySelector<HTMLButtonElement>('#add-local-event-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.panelOptions.onAddLocalEvent());
        }

        // Local event items - visibility toggle (click on item)
        const localEventItems = this.querySelectorAll<HTMLElement>(`.${styles['local-event-item']}`);
        localEventItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't toggle if clicking edit/delete buttons
                if ((e.target as HTMLElement).closest(`.${styles['local-event-actions']}`)) return;

                const eventId = item.dataset.eventId;
                if (eventId) {
                    this.panelOptions.onToggleLocalEventVisibility(eventId);
                }
            });
        });

        // Local event edit buttons
        const editBtns = this.querySelectorAll<HTMLButtonElement>(`.${styles['local-event-edit-btn']}`);
        editBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const eventId = btn.dataset.eventId;
                if (eventId) {
                    this.panelOptions.onEditLocalEvent(eventId);
                }
            });
        });

        // Local event delete buttons
        const deleteBtns = this.querySelectorAll<HTMLButtonElement>(`.${styles['local-event-delete-btn']}`);
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const eventId = btn.dataset.eventId;
                if (eventId) {
                    this.panelOptions.onDeleteLocalEvent(eventId);
                }
            });
        });

        // External calendar section buttons (if present)
        if (this.hasExternalEvents) {
            // Show all button
            const showAllBtn = this.querySelector<HTMLButtonElement>('#calendar-show-all-btn');
            if (showAllBtn && this.panelOptions.onShowAll) {
                showAllBtn.addEventListener('click', () => this.panelOptions.onShowAll!());
            }

            // Hide all button
            const hideAllBtn = this.querySelector<HTMLButtonElement>('#calendar-hide-all-btn');
            if (hideAllBtn && this.panelOptions.onHideAll) {
                hideAllBtn.addEventListener('click', () => this.panelOptions.onHideAll!());
            }

            // Change calendar button
            const changeBtn = this.querySelector<HTMLButtonElement>('#calendar-change-btn');
            if (changeBtn && this.panelOptions.onChangeCalendar) {
                changeBtn.addEventListener('click', () => this.panelOptions.onChangeCalendar!());
            }

            // External event items
            const externalEventItems = this.querySelectorAll<HTMLElement>(`.${styles['external-event-item']}`);
            externalEventItems.forEach(item => {
                item.addEventListener('click', () => {
                    const eventId = item.dataset.eventId;
                    if (eventId && this.panelOptions.excludedEventIds && this.panelOptions.onExclusionChange) {
                        const isCurrentlyExcluded = this.panelOptions.excludedEventIds.has(eventId);
                        this.panelOptions.onExclusionChange(eventId, !isCurrentlyExcluded);
                    }
                });
            });
        }
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
     * Render the local events section
     */
    private renderLocalEventsSection(): string {
        const localEvents = this.localEventsCopy;
        const hiddenCount = localEvents.filter(e => !e.visible).length;

        return `
            <div class="${styles['local-events-section']}">
                <div class="${styles['section-header']}">
                    <span class="${styles['section-title']}">Your Events</span>
                    <span class="${styles['section-count']}">${localEvents.length} event${localEvents.length !== 1 ? 's' : ''}${hiddenCount > 0 ? `, ${hiddenCount} hidden` : ''}</span>
                </div>
                <div class="${styles['local-events-list']}">
                    ${localEvents.length > 0
                        ? localEvents.map(event => this.renderLocalEventItem(event)).join('')
                        : `<div class="${styles['no-events-message']}">No events yet. Click + to add one.</div>`
                    }
                </div>
            </div>
        `;
    }

    /**
     * Render a single local event item
     */
    private renderLocalEventItem(event: LocalCalendarEvent): string {
        const dayNames: Record<DayOfWeek, string> = {
            [DayOfWeek.MONDAY]: 'Mon',
            [DayOfWeek.TUESDAY]: 'Tue',
            [DayOfWeek.WEDNESDAY]: 'Wed',
            [DayOfWeek.THURSDAY]: 'Thu',
            [DayOfWeek.FRIDAY]: 'Fri',
            [DayOfWeek.SATURDAY]: 'Sat',
            [DayOfWeek.SUNDAY]: 'Sun',
        };

        const startTime = this.formatTime(event.startTime.hours, event.startTime.minutes);
        const endTime = this.formatTime(event.endTime.hours, event.endTime.minutes);

        // Build schedule info based on event type
        let scheduleInfo: string;
        if (event.eventType === 'one-time' && event.date) {
            // One-time: show the date
            const date = new Date(event.date);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            scheduleInfo = dateStr;
        } else {
            // Recurring: show days and terms
            const days = event.days || (event.day ? [event.day] : []);
            const daysStr = days.map(d => dayNames[d] || '?').join(', ') || 'No days';
            const termsStr = event.terms?.join(', ') || '';
            scheduleInfo = termsStr ? `${daysStr} • Terms: ${termsStr}` : daysStr;
        }

        return `
            <div class="${styles['local-event-item']} ${styles['calendar-event-item']} ${event.visible ? '' : styles.excluded}"
                 data-event-id="${event.id}">
                <div class="${styles['event-visibility-toggle']}">
                    ${event.visible
                        ? getInlineSVG('HEXAGON_PLUS', 'visibility-icon visible')
                        : getInlineSVG('HEXAGON_MINUS', 'visibility-icon hidden')
                    }
                </div>
                <div class="${styles['event-details']}">
                    <div class="${styles['event-summary']}">${Validators.escapeHtml(event.title)}</div>
                    <div class="${styles['event-datetime']}">${scheduleInfo}</div>
                    <div class="${styles['event-time']}">${startTime} - ${endTime}</div>
                </div>
                <div class="${styles['local-event-actions']}">
                    <button class="${styles['local-event-edit-btn']}" data-event-id="${event.id}" title="Edit">
                        ${getInlineSVG('SETTINGS', 'action-icon')}
                    </button>
                    <button class="${styles['local-event-delete-btn']}" data-event-id="${event.id}" title="Delete">
                        ${getInlineSVG('TRASH', 'action-icon')}
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Format time for display
     */
    private formatTime(hours: number, minutes: number): string {
        const h = hours % 12 || 12;
        const m = minutes.toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        return `${h}:${m} ${ampm}`;
    }

    /**
     * Render the external events section (only if connected)
     */
    private renderExternalEventsSection(): string {
        if (!this.hasExternalEvents) {
            return '';
        }

        const totalEvents = this.getTotalExternalEventCount();
        const calendarName = this.panelOptions.calendarName || 'External Calendar';

        return `
            <div class="${styles['external-events-section']}">
                <div class="${styles['section-header']} ${styles['external-section-header']}">
                    <div class="${styles['section-title-row']}">
                        <span class="${styles['section-title']}">${Validators.escapeHtml(calendarName)}</span>
                        <span class="${styles['section-count']}">${totalEvents} event${totalEvents !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="${styles['section-actions']}">
                        <button class="${styles['calendar-events-action-btn']}" id="calendar-change-btn" title="Change calendar">
                            ${getInlineSVG('CALENDAR_REPEAT', 'action-icon')}
                        </button>
                        <button class="${styles['calendar-events-action-btn']}" id="calendar-show-all-btn" title="Show all">
                            ${getInlineSVG('HEXAGON_PLUS', 'action-icon')}
                        </button>
                        <button class="${styles['calendar-events-action-btn']}" id="calendar-hide-all-btn" title="Hide all">
                            ${getInlineSVG('HEXAGON_MINUS', 'action-icon')}
                        </button>
                    </div>
                </div>
                ${this.renderExternalEventsList()}
            </div>
        `;
    }

    /**
     * Render the external events list grouped by term
     */
    private renderExternalEventsList(): string {
        const terms = ['A', 'B', 'C', 'D'];
        let html = '';

        for (const term of terms) {
            const events = this.eventsCopy.get(term) || [];
            if (events.length === 0) continue;

            const hiddenCount = this.panelOptions.excludedEventIds
                ? events.filter(e => e.id && this.panelOptions.excludedEventIds!.has(e.id)).length
                : 0;

            html += `
                <div class="${styles['calendar-term-group']}">
                    <div class="${styles['calendar-term-header']}">
                        <span class="${styles['term-label']}">Term ${term}</span>
                        <span class="${styles['term-count']}">${events.length} event${events.length !== 1 ? 's' : ''}${hiddenCount > 0 ? `, ${hiddenCount} hidden` : ''}</span>
                    </div>
                    <div class="${styles['calendar-term-events']}">
                        ${events.map(event => this.renderExternalEventItem(event, term)).join('')}
                    </div>
                </div>
            `;
        }

        if (!html) {
            html = `<div class="${styles['no-events-message']}">No external calendar events found</div>`;
        }

        return html;
    }

    /**
     * Render a single external event item
     */
    private renderExternalEventItem(event: CalendarEvent, term: string): string {
        const isExcluded = event.id && this.panelOptions.excludedEventIds
            ? this.panelOptions.excludedEventIds.has(event.id)
            : false;
        const eventDate = new Date(event.start.dateTime);
        const dayName = eventDate.toLocaleDateString('en-US', { weekday: 'short' });
        const time = eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const dateStr = eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        // For recurring events, show recurrence description instead of specific date
        const isRecurring = !!event.recurrenceDescription;
        const recurrenceHtml = isRecurring
            ? `<div class="${styles['event-recurrence']}">${Validators.escapeHtml(event.recurrenceDescription!)}</div>`
            : '';

        // Show occurrence count for recurring events
        const occurrenceHtml = event.occurrenceCount && event.occurrenceCount > 1
            ? `<span class="${styles['occurrence-count']}">${event.occurrenceCount} occurrences</span>`
            : '';

        // Show start time and first date (or just time for recurring)
        const datetimeHtml = isRecurring
            ? `<div class="${styles['event-datetime']}">${time}${occurrenceHtml ? ` · ${occurrenceHtml}` : ''}</div>`
            : `<div class="${styles['event-datetime']}">${dayName}, ${dateStr} at ${time}</div>`;

        return `
            <div class="${styles['external-event-item']} ${styles['calendar-event-item']} ${isExcluded ? styles.excluded : ''} ${isRecurring ? styles.recurring : ''}"
                 data-event-id="${event.id || ''}"
                 data-term="${term}">
                <div class="${styles['event-visibility-toggle']}">
                    ${isExcluded
                        ? getInlineSVG('HEXAGON_MINUS', 'visibility-icon hidden')
                        : getInlineSVG('HEXAGON_PLUS', 'visibility-icon visible')
                    }
                </div>
                <div class="${styles['event-details']}">
                    <div class="${styles['event-summary']}">${Validators.escapeHtml(event.summary || 'Untitled Event')}</div>
                    ${recurrenceHtml}
                    ${datetimeHtml}
                </div>
            </div>
        `;
    }

    /**
     * Get total external event count across all terms
     */
    private getTotalExternalEventCount(): number {
        let total = 0;
        for (const events of this.eventsCopy.values()) {
            total += events.length;
        }
        return total;
    }
}
