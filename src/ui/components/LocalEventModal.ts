// =============================================================================
// Local Event Modal - Add/Edit local calendar events
// =============================================================================

import { ModalService } from '../../services/ui/ModalService';
import { BaseModal } from './BaseModal';
import type { LocalCalendarEvent } from '../../types/schedule';
import { DayOfWeek } from '../../types/types';
import { getInlineSVG } from '../../utils/iconPaths';

export interface LocalEventModalOptions {
    /** Callback when event is saved */
    onSave: (event: Omit<LocalCalendarEvent, 'id' | 'createdAt' | 'updatedAt'>) => void;
    /** Optional: existing event to edit (if not provided, creates new) */
    existingEvent?: LocalCalendarEvent;
}

type EventType = 'one-time' | 'recurring';

interface DayOption {
    value: DayOfWeek;
    label: string;
    short: string;
}

const WEEKDAYS: DayOption[] = [
    { value: DayOfWeek.MONDAY, label: 'Monday', short: 'M' },
    { value: DayOfWeek.TUESDAY, label: 'Tuesday', short: 'T' },
    { value: DayOfWeek.WEDNESDAY, label: 'Wednesday', short: 'W' },
    { value: DayOfWeek.THURSDAY, label: 'Thursday', short: 'T' },
    { value: DayOfWeek.FRIDAY, label: 'Friday', short: 'F' },
];

/**
 * Modal for adding or editing local calendar events.
 * Supports both one-time (specific date) and recurring (weekly) events.
 */
export class LocalEventModal extends BaseModal {
    private options: LocalEventModalOptions;
    private isEditMode: boolean;
    private currentEventType: EventType = 'recurring';
    private selectedDays: Set<DayOfWeek> = new Set();

    constructor(modalService: ModalService, options: LocalEventModalOptions) {
        super(modalService);
        this.options = options;
        this.isEditMode = !!options.existingEvent;

        // Initialize from existing event
        if (options.existingEvent) {
            this.currentEventType = options.existingEvent.eventType || 'recurring';
            // Handle both old `day` field and new `days` array
            if (options.existingEvent.days?.length) {
                this.selectedDays = new Set(options.existingEvent.days);
            } else if (options.existingEvent.day) {
                this.selectedDays = new Set([options.existingEvent.day]);
            }
        } else {
            // Default: Monday selected for new recurring events
            this.selectedDays = new Set([DayOfWeek.MONDAY]);
        }
    }

    /**
     * Show the modal
     */
    show(): void {
        const modalElement = this.createModalElement();
        this.showModal(modalElement);
        this.attachEventListeners();

        // Focus title input
        const titleInput = this.modalElement?.querySelector('#event-title') as HTMLInputElement;
        if (titleInput) {
            titleInput.focus();
        }
    }

    /**
     * Create the modal DOM structure
     */
    private createModalElement(): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';

        const event = this.options.existingEvent;
        const title = event?.title || '';
        const description = event?.description || '';
        const eventType = this.currentEventType;
        const date = event?.date || this.getTodayDate();
        const startHour = event?.startTime?.hours ?? 9;
        const startMin = event?.startTime?.minutes ?? 0;
        const endHour = event?.endTime?.hours ?? 10;
        const endMin = event?.endTime?.minutes ?? 0;
        const terms = event?.terms || ['A', 'B', 'C', 'D'];

        backdrop.innerHTML = `
            <div class="modal-dialog local-event-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">${this.isEditMode ? 'Edit Event' : 'Add Event'}</h3>
                        <button class="modal-close" data-modal-close>&times;</button>
                    </div>
                    <div class="modal-body local-event-form" data-type="${eventType}">
                        <!-- Title -->
                        <div class="form-group">
                            <label for="event-title">Title <span class="required">*</span></label>
                            <input type="text" id="event-title" class="form-input"
                                   placeholder="Event title" value="${this.escapeHtml(title)}" required>
                        </div>

                        <!-- Description -->
                        <div class="form-group">
                            <label for="event-description">Description</label>
                            <textarea id="event-description" class="form-input form-textarea"
                                      placeholder="Optional description">${this.escapeHtml(description)}</textarea>
                        </div>

                        <!-- Event Type Selector -->
                        <div class="form-group">
                            <label>Event Type</label>
                            <div class="event-type-selector">
                                <button type="button" class="event-type-option ${eventType === 'one-time' ? 'selected' : ''}"
                                        data-type="one-time">
                                    ${getInlineSVG('CALENDAR_DOWN', 'type-icon')}
                                    One-time
                                </button>
                                <button type="button" class="event-type-option ${eventType === 'recurring' ? 'selected' : ''}"
                                        data-type="recurring">
                                    ${getInlineSVG('CALENDAR_REPEAT', 'type-icon')}
                                    Recurring
                                </button>
                            </div>
                        </div>

                        <!-- One-time: Date picker -->
                        <div class="one-time-fields">
                            <div class="form-group">
                                <label for="event-date">Date</label>
                                <input type="date" id="event-date" class="form-input" value="${date}">
                            </div>
                        </div>

                        <!-- Recurring: Day selector -->
                        <div class="recurring-fields">
                            <div class="form-group">
                                <label>Days <span class="required">*</span></label>
                                <div class="day-selector">
                                    ${this.renderDayPills()}
                                </div>
                            </div>

                            <div class="form-group">
                                <label>Terms</label>
                                <div class="event-term-checkboxes">
                                    ${this.renderTermCheckboxes(terms)}
                                </div>
                            </div>
                        </div>

                        <!-- Time (shared) -->
                        <div class="form-group">
                            <label>Time</label>
                            <div class="time-row">
                                <div class="form-group-time">
                                    <input type="time" id="event-start" class="form-input"
                                           value="${this.formatTime(startHour, startMin)}">
                                </div>
                                <span class="time-separator">to</span>
                                <div class="form-group-time">
                                    <input type="time" id="event-end" class="form-input"
                                           value="${this.formatTime(endHour, endMin)}">
                                </div>
                            </div>
                        </div>

                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn btn-secondary" data-modal-close>Cancel</button>
                        <button class="modal-btn btn-primary" data-action="save">
                            ${getInlineSVG('CHECK', 'btn-icon')}
                            ${this.isEditMode ? 'Save Changes' : 'Add Event'}
                        </button>
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
     * Render day pill buttons for multi-select
     */
    private renderDayPills(): string {
        return WEEKDAYS.map(day => `
            <button type="button" class="day-pill ${this.selectedDays.has(day.value) ? 'selected' : ''}"
                    data-day="${day.value}" title="${day.label}">
                ${day.short}
            </button>
        `).join('');
    }

    /**
     * Render term checkboxes
     */
    private renderTermCheckboxes(selectedTerms: string[]): string {
        const terms = ['A', 'B', 'C', 'D'];
        return terms.map(term => `
            <label class="event-term-label">
                <span class="event-term-text">Term ${term}</span>
                <input type="checkbox" class="event-term-toggle" name="terms" value="${term}"
                       ${selectedTerms.includes(term) ? 'checked' : ''}>
            </label>
        `).join('');
    }

    /**
     * Get today's date in ISO format
     */
    private getTodayDate(): string {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Format time for input value
     */
    private formatTime(hours: number, minutes: number): string {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    /**
     * Parse time input value
     */
    private parseTime(value: string): { hours: number; minutes: number } {
        const [hours, minutes] = value.split(':').map(Number);
        return { hours: hours || 0, minutes: minutes || 0 };
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

        // Save button handler
        const saveBtn = this.modalElement.querySelector('[data-action="save"]');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.handleSave());
        }

        // Enter key to save (on title input)
        const titleInput = this.modalElement.querySelector('#event-title');
        if (titleInput) {
            titleInput.addEventListener('keydown', (e) => {
                if ((e as KeyboardEvent).key === 'Enter') {
                    e.preventDefault();
                    this.handleSave();
                }
            });
        }

        // Event type selector
        this.modalElement.querySelectorAll('.event-type-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const type = target.dataset.type as EventType;
                this.setEventType(type);
            });
        });

        // Day pill selector
        this.modalElement.querySelectorAll('.day-pill').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const day = target.dataset.day as DayOfWeek;
                this.toggleDay(day, target);
            });
        });
    }

    /**
     * Set the event type and update UI
     */
    private setEventType(type: EventType): void {
        this.currentEventType = type;

        if (!this.modalElement) return;

        // Update form data attribute
        const form = this.modalElement.querySelector('.local-event-form');
        if (form) {
            form.setAttribute('data-type', type);
        }

        // Update selector buttons
        this.modalElement.querySelectorAll('.event-type-option').forEach(btn => {
            const btnType = (btn as HTMLElement).dataset.type;
            btn.classList.toggle('selected', btnType === type);
        });
    }

    /**
     * Toggle a day selection
     */
    private toggleDay(day: DayOfWeek, element: HTMLElement): void {
        if (this.selectedDays.has(day)) {
            // Don't allow deselecting if it's the last one
            if (this.selectedDays.size > 1) {
                this.selectedDays.delete(day);
                element.classList.remove('selected');
            }
        } else {
            this.selectedDays.add(day);
            element.classList.add('selected');
        }

        // Clear any error state
        const daySelector = this.modalElement?.querySelector('.day-selector');
        daySelector?.classList.remove('form-error');
    }

    /**
     * Validate form and show errors
     */
    private validateForm(): boolean {
        if (!this.modalElement) return false;

        const titleInput = this.modalElement.querySelector('#event-title') as HTMLInputElement;
        const title = titleInput?.value?.trim();

        if (!title) {
            titleInput?.classList.add('form-error');
            titleInput?.focus();
            return false;
        }
        titleInput?.classList.remove('form-error');

        // Type-specific validation
        if (this.currentEventType === 'recurring') {
            // Check at least one day is selected
            if (this.selectedDays.size === 0) {
                const daySelector = this.modalElement.querySelector('.day-selector');
                daySelector?.classList.add('form-error');
                return false;
            }

            // Check at least one term is selected
            const termCheckboxes = this.modalElement.querySelectorAll('input[name="terms"]:checked');
            if (termCheckboxes.length === 0) {
                const termContainer = this.modalElement.querySelector('.event-term-checkboxes');
                termContainer?.classList.add('form-error');
                return false;
            }
        } else {
            // One-time: validate date
            const dateInput = this.modalElement.querySelector('#event-date') as HTMLInputElement;
            if (!dateInput?.value) {
                dateInput?.classList.add('form-error');
                dateInput?.focus();
                return false;
            }
            dateInput?.classList.remove('form-error');
        }

        // Check end time is after start time
        const startInput = this.modalElement.querySelector('#event-start') as HTMLInputElement;
        const endInput = this.modalElement.querySelector('#event-end') as HTMLInputElement;
        const startTime = this.parseTime(startInput?.value || '09:00');
        const endTime = this.parseTime(endInput?.value || '10:00');

        const startMinutes = startTime.hours * 60 + startTime.minutes;
        const endMinutes = endTime.hours * 60 + endTime.minutes;

        if (endMinutes <= startMinutes) {
            endInput?.classList.add('form-error');
            return false;
        }
        endInput?.classList.remove('form-error');

        return true;
    }

    /**
     * Handle the Save button click
     */
    private handleSave(): void {
        if (!this.validateForm()) return;
        if (!this.modalElement) return;

        const titleInput = this.modalElement.querySelector('#event-title') as HTMLInputElement;
        const descInput = this.modalElement.querySelector('#event-description') as HTMLTextAreaElement;
        const startInput = this.modalElement.querySelector('#event-start') as HTMLInputElement;
        const endInput = this.modalElement.querySelector('#event-end') as HTMLInputElement;

        const startTime = this.parseTime(startInput?.value || '09:00');
        const endTime = this.parseTime(endInput?.value || '10:00');

        const eventData: Omit<LocalCalendarEvent, 'id' | 'createdAt' | 'updatedAt'> = {
            title: titleInput.value.trim(),
            description: descInput.value.trim() || undefined,
            eventType: this.currentEventType,
            startTime,
            endTime,
            visible: true, // Always visible
        };

        if (this.currentEventType === 'one-time') {
            const dateInput = this.modalElement.querySelector('#event-date') as HTMLInputElement;
            eventData.date = dateInput.value;
        } else {
            // Recurring
            eventData.days = Array.from(this.selectedDays);

            const termCheckboxes = this.modalElement.querySelectorAll('input[name="terms"]:checked');
            const terms: string[] = [];
            termCheckboxes.forEach(cb => {
                terms.push((cb as HTMLInputElement).value);
            });
            eventData.terms = terms;
        }

        // Call the callback with event data
        this.options.onSave(eventData);

        // Close the modal
        this.hide();
    }
}
