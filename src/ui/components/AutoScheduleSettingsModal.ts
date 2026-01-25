// =============================================================================
// Auto Schedule Settings Modal - Configure settings before auto-scheduling
// =============================================================================

import { ModalService } from '../../services/ui/ModalService';
import { BaseModal } from './BaseModal';
import type { AutoScheduleSettings } from '../../types/schedule';
import { getInlineSVG } from '../../utils/iconPaths';

export interface AutoScheduleSettingsModalOptions {
    /** Callback when user clicks Next with settings */
    onNext: (settings: AutoScheduleSettings) => void;
    /** Callback to open the calendar events panel (closes modal) */
    onOpenCalendarPanel: () => void;
    /** Whether a calendar is connected (determines if toggle is shown) */
    hasConnectedCalendar: boolean;
    /** Display name of the connected calendar */
    calendarName?: string;
    /** Provider ID of the connected calendar */
    calendarProvider?: string;
    /** Number of calendar events that will be blocked */
    calendarEventCount?: number;
    /** Number of local events that will be blocked */
    localEventCount?: number;
}

/**
 * Modal for configuring auto-schedule settings before generation.
 * Includes toggle to avoid calendar events when scheduling.
 */
export class AutoScheduleSettingsModal extends BaseModal {
    private options: AutoScheduleSettingsModalOptions;
    private avoidCalendarEvents: boolean = false;

    constructor(modalService: ModalService, options: AutoScheduleSettingsModalOptions) {
        super(modalService);
        this.options = options;
    }

    /**
     * Show the modal
     */
    show(): void {
        const modalElement = this.createModalElement();
        this.showModal(modalElement);
        this.attachEventListeners();
    }

    /**
     * Create the modal DOM structure
     */
    private createModalElement(): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';

        backdrop.innerHTML = `
            <div class="modal-dialog auto-schedule-settings-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">Auto Schedule Settings</h3>
                        <button class="modal-close" data-modal-close>&times;</button>
                    </div>
                    <div class="modal-body auto-schedule-settings-body">
                        ${this.renderCalendarSection()}
                        ${this.renderWakeUpTimeSection()}
                        ${this.renderPlaceholderSection()}
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn btn-secondary" data-modal-close>Cancel</button>
                        <button class="modal-btn btn-primary" data-action="next">Next</button>
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

        return backdrop;
    }

    /**
     * Render the calendar events section (if calendar connected or local events exist)
     */
    private renderCalendarSection(): string {
        const cloudCount = this.options.calendarEventCount || 0;
        const localCount = this.options.localEventCount || 0;
        const totalCount = cloudCount + localCount;

        // Show section if there are ANY events (cloud OR local) OR if calendar connected
        if (totalCount === 0 && !this.options.hasConnectedCalendar) {
            return '';
        }

        // Build display name
        let displayName = 'Calendar Events';
        if (this.options.hasConnectedCalendar && this.options.calendarName) {
            const calendarName = this.escapeHtml(this.options.calendarName);
            const calendarProvider = this.options.calendarProvider || '';
            displayName = calendarProvider
                ? `${calendarName} (${calendarProvider})`
                : calendarName;
        }

        // Build count message with smart formatting
        let countMessage: string;
        if (cloudCount > 0 && localCount > 0) {
            // Both types present
            countMessage = `${cloudCount} cloud + ${localCount} local event${totalCount !== 1 ? 's' : ''} will be blocked`;
        } else if (localCount > 0) {
            // Only local events
            countMessage = `${localCount} local event${localCount !== 1 ? 's' : ''} will be blocked`;
        } else if (cloudCount > 0) {
            // Only cloud events
            countMessage = `${cloudCount} event${cloudCount !== 1 ? 's' : ''} will be blocked`;
        } else {
            // No events (but calendar might be connected)
            countMessage = 'No events to block';
        }

        return `
            <div class="settings-section calendar-section">
                <label class="settings-toggle-label">
                    <input type="checkbox" class="settings-toggle" id="avoid-calendar-toggle" ${this.avoidCalendarEvents ? 'checked' : ''}>
                    <span class="settings-toggle-text">Avoid calendar events</span>
                </label>
                <button class="calendar-events-btn modal-calendar-btn" id="modal-calendar-btn" style="display: ${this.avoidCalendarEvents ? 'flex' : 'none'}">
                    <span class="calendar-events-btn-icon">${getInlineSVG('CALENDAR_DOWN', 'calendar-btn-icon')}</span>
                    <span class="calendar-events-btn-info">
                        <span class="calendar-events-btn-name">${displayName}</span>
                        <span class="calendar-events-btn-count">${countMessage}</span>
                    </span>
                </button>
            </div>
        `;
    }

    /**
     * Render the wake up time section
     */
    private renderWakeUpTimeSection(): string {
        return `
            <div class="settings-section wake-up-time-section">
                <label class="wake-up-time-label" for="wake-up-time-input">
                    Wake up time (earliest class)
                </label>
                <input
                    type="time"
                    id="wake-up-time-input"
                    class="wake-up-time-input"
                >
                <p class="wake-up-time-hint">
                    Schedules with classes before this time will appear later in the list
                </p>
            </div>
        `;
    }

    /**
     * Render placeholder section for future settings
     */
    private renderPlaceholderSection(): string {
        const cloudCount = this.options.calendarEventCount || 0;
        const localCount = this.options.localEventCount || 0;
        const totalCount = cloudCount + localCount;

        // Only show placeholder if NO events at all AND no calendar connected
        if (totalCount > 0 || this.options.hasConnectedCalendar) {
            return '';
        }

        return `
            <div class="settings-section placeholder-section">
                <p class="settings-placeholder">
                    Configure your auto-scheduling preferences here.
                </p>
                <p class="settings-hint">
                    Settings and weights will be added in future updates.
                </p>
            </div>
        `;
    }

    /**
     * Attach event listeners after modal is shown
     */
    private attachEventListeners(): void {
        if (!this.modalElement) return;

        // Close button handlers
        this.modalElement.querySelectorAll('[data-modal-close]').forEach(btn => {
            btn.addEventListener('click', () => this.hide());
        });

        // Next button handler
        const nextBtn = this.modalElement.querySelector('[data-action="next"]');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.handleNext());
        }

        // Toggle handler
        const toggle = this.modalElement.querySelector('#avoid-calendar-toggle') as HTMLInputElement;
        if (toggle) {
            toggle.addEventListener('change', () => this.handleToggleChange(toggle.checked));
        }

        // Calendar button handler
        const calendarBtn = this.modalElement.querySelector('#modal-calendar-btn');
        if (calendarBtn) {
            calendarBtn.addEventListener('click', () => this.handleCalendarButtonClick());
        }
    }

    /**
     * Handle toggle change - show/hide calendar button
     */
    private handleToggleChange(checked: boolean): void {
        this.avoidCalendarEvents = checked;

        const calendarBtn = this.modalElement?.querySelector('#modal-calendar-btn') as HTMLElement;
        if (calendarBtn) {
            calendarBtn.style.display = checked ? 'flex' : 'none';
        }
    }

    /**
     * Handle calendar button click - close modal and open panel
     */
    private handleCalendarButtonClick(): void {
        this.hide();
        this.options.onOpenCalendarPanel();
    }

    /**
     * Validate time input values
     */
    private validateTimeInput(hours: number, minutes: number): boolean {
        return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
    }

    /**
     * Handle the Next button click
     */
    private handleNext(): void {
        let wakeUpTime: { hours: number; minutes: number } | null = null;

        const wakeUpInput = document.getElementById('wake-up-time-input') as HTMLInputElement;

        if (wakeUpInput && wakeUpInput.value && wakeUpInput.value.trim()) {
            const [hours, minutes] = wakeUpInput.value.split(':').map(Number);
            if (!isNaN(hours) && !isNaN(minutes)) {
                if (!this.validateTimeInput(hours, minutes)) {
                    alert('Invalid wake-up time. Hours must be 0-23, minutes 0-59.');
                    return;
                }
                wakeUpTime = { hours, minutes };
            }
        }

        const settings: AutoScheduleSettings = {
            blockedTimes: [],
            avoidCalendarEvents: this.avoidCalendarEvents,
            wakeUpTime
        };

        this.options.onNext(settings);
        this.hide();
    }
}
