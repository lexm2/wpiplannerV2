// =============================================================================
// Calendar Select Modal - Choose which calendar to fetch events from
// =============================================================================

import { ModalService } from '../../services/ui/ModalService';
import { BaseModal } from './BaseModal';
import type { CalendarInfo, CalendarProvider } from '../../services/calendar/types';
import { getInlineSVG } from '../../utils/iconPaths';

export interface CalendarSelectModalOptions {
    /** Currently selected calendar ID */
    currentCalendarId: string;
    /** Callback when a calendar is selected */
    onSelect: (calendar: CalendarInfo) => void;
}

/**
 * Modal for selecting which calendar to fetch external events from.
 * Displays a list of available calendars from the provider.
 */
export class CalendarSelectModal extends BaseModal {
    private options: CalendarSelectModalOptions;
    private calendars: CalendarInfo[] = [];
    private isLoading = true;
    private error: string | null = null;

    constructor(modalService: ModalService, options: CalendarSelectModalOptions) {
        super(modalService);
        this.options = options;
    }

    /**
     * Show the modal and fetch calendars from the provider
     */
    async show(provider: CalendarProvider): Promise<void> {
        // Create and show modal with loading state
        const modalElement = this.createModalElement();
        this.showModal(modalElement);

        // Fetch calendars
        try {
            this.calendars = await provider.listCalendars();
            this.isLoading = false;
            this.updateContent();
        } catch (err) {
            console.error('[CalendarSelectModal] Failed to fetch calendars:', err);
            this.isLoading = false;
            this.error = err instanceof Error ? err.message : 'Failed to load calendars';
            this.updateContent();
        }
    }

    /**
     * Create the modal DOM structure
     */
    private createModalElement(): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';

        backdrop.innerHTML = `
            <div class="modal-dialog calendar-select-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">Select Calendar</h3>
                        <button class="modal-close" data-modal-close>&times;</button>
                    </div>
                    <div class="modal-body calendar-select-body">
                        ${this.renderContent()}
                    </div>
                </div>
            </div>
        `;

        // Stop propagation on dialog to prevent backdrop click from closing
        const dialog = backdrop.querySelector('.modal-dialog');
        if (dialog instanceof HTMLElement) {
            dialog.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        }

        // Close button handler
        backdrop.querySelectorAll('[data-modal-close]').forEach(btn => {
            btn.addEventListener('click', () => this.hide());
        });

        return backdrop;
    }

    /**
     * Render the content based on current state
     */
    private renderContent(): string {
        if (this.isLoading) {
            return `
                <div class="calendar-list-loading">
                    <div class="loading-spinner"></div>
                    <p>Loading calendars...</p>
                </div>
            `;
        }

        if (this.error) {
            return `
                <div class="calendar-list-error">
                    ${getInlineSVG('ALERT_CIRCLE', 'error-icon')}
                    <p>${this.escapeHtml(this.error)}</p>
                </div>
            `;
        }

        if (this.calendars.length === 0) {
            return `
                <div class="calendar-list-empty">
                    <p>No calendars found</p>
                </div>
            `;
        }

        // Sort: primary first, then alphabetically
        const sorted = [...this.calendars].sort((a, b) => {
            if (a.isPrimary && !b.isPrimary) return -1;
            if (!a.isPrimary && b.isPrimary) return 1;
            return a.name.localeCompare(b.name);
        });

        return `
            <ul class="calendar-list">
                ${sorted.map(cal => this.renderCalendarItem(cal)).join('')}
            </ul>
        `;
    }

    /**
     * Render a single calendar list item
     */
    private renderCalendarItem(calendar: CalendarInfo): string {
        const isSelected = calendar.id === this.options.currentCalendarId;
        const colorStyle = calendar.color ? `background-color: ${calendar.color}` : '';

        return `
            <li class="calendar-list-item ${isSelected ? 'selected' : ''}" data-calendar-id="${this.escapeHtml(calendar.id)}">
                <span class="calendar-color-dot" style="${colorStyle}"></span>
                <span class="calendar-name">${this.escapeHtml(calendar.name)}</span>
                ${calendar.isPrimary ? '<span class="calendar-primary-badge">Primary</span>' : ''}
                ${isSelected ? `<span class="calendar-selected-icon">${getInlineSVG('CHECK', 'check-icon')}</span>` : ''}
            </li>
        `;
    }

    /**
     * Update the modal content after loading
     */
    private updateContent(): void {
        if (!this.modalElement) return;

        const body = this.modalElement.querySelector('.calendar-select-body');
        if (body) {
            body.innerHTML = this.renderContent();
            this.attachListItemListeners();
        }
    }

    /**
     * Attach click listeners to calendar list items
     */
    private attachListItemListeners(): void {
        if (!this.modalElement) return;

        const items = this.modalElement.querySelectorAll('.calendar-list-item');
        items.forEach(item => {
            item.addEventListener('click', () => {
                const calendarId = (item as HTMLElement).dataset.calendarId;
                if (calendarId) {
                    const calendar = this.calendars.find(c => c.id === calendarId);
                    if (calendar) {
                        this.options.onSelect(calendar);
                    }
                }
            });
        });
    }
}
