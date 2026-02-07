export interface RMPFilterOptions {
    idPrefix: string;
    filterId: string;
    activeFilter?: unknown;
}

export interface ProfessorFilterOptions {
    idPrefix: string;
    filterId: string;
    activeProfessors: string[];
}

export interface TermFilterOptions {
    idPrefix: string;
    filterId: string;
    terms: string[];
    activeTerms: string[];
}

export interface AvailabilityFilterOptions {
    idPrefix: string;
    filterId: string;
    availableOnly: boolean;
    minAvailable?: number;
    avoidConflicts?: boolean;
}

export interface ConflictFilterOptions {
    idPrefix: string;
    filterId: string;
    avoidConflicts: boolean;
    includeCalendarToggle?: boolean;
    hasCalendarEvents?: boolean;
    calendarEventCount?: number;
}

export class SharedFilterComponents {
    static escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static createRMPRatingFilter(options: RMPFilterOptions): string {
        const { idPrefix, activeFilter } = options;
        const prefix = idPrefix ? `${idPrefix}-` : '';

        const filterObj = activeFilter && typeof activeFilter === 'object' ? activeFilter as Record<string, unknown> : null;
        const criteria = filterObj?.criteria && typeof filterObj.criteria === 'object' ? filterObj.criteria as Record<string, unknown> : null;

        const minRating = typeof criteria?.minRating === 'number' ? criteria.minRating : 0;
        const maxRating = typeof criteria?.maxRating === 'number' ? criteria.maxRating : 5;
        const minDifficulty = typeof criteria?.minDifficulty === 'number' ? criteria.minDifficulty : 0;
        const maxDifficulty = typeof criteria?.maxDifficulty === 'number' ? criteria.maxDifficulty : 5;
        const minWouldTakeAgain = typeof criteria?.minWouldTakeAgain === 'number' ? criteria.minWouldTakeAgain : 0;
        const maxWouldTakeAgain = typeof criteria?.maxWouldTakeAgain === 'number' ? criteria.maxWouldTakeAgain : 100;

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Rate My Professor</h4>
                </div>
                <div class="filter-section-content">
                    <div class="filter-slider-container">
                        <div class="filter-slider-group">
                            <label>Rating</label>
                            <div class="filter-slider-values">
                                <span id="${prefix}rmp-rating-min-value">${minRating.toFixed(1)}</span>
                                <span>-</span>
                                <span id="${prefix}rmp-rating-max-value">${maxRating.toFixed(1)}</span>
                                <span class="filter-input-hint">stars</span>
                            </div>
                            <div id="${prefix}rmp-rating-slider-container"></div>
                        </div>
                        <div class="filter-slider-group">
                            <label>Difficulty</label>
                            <div class="filter-slider-values">
                                <span id="${prefix}rmp-difficulty-min-value">${minDifficulty.toFixed(1)}</span>
                                <span>-</span>
                                <span id="${prefix}rmp-difficulty-max-value">${maxDifficulty.toFixed(1)}</span>
                                <span class="filter-input-hint">scale</span>
                            </div>
                            <div id="${prefix}rmp-difficulty-slider-container"></div>
                        </div>
                        <div class="filter-slider-group">
                            <label>Would Take Again</label>
                            <div class="filter-slider-values">
                                <span id="${prefix}rmp-retake-min-value">${minWouldTakeAgain}</span>
                                <span>-</span>
                                <span id="${prefix}rmp-retake-max-value">${maxWouldTakeAgain}</span>
                                <span class="filter-input-hint">%</span>
                            </div>
                            <div id="${prefix}rmp-retake-slider-container"></div>
                        </div>
                    </div>
                    <label class="filter-toggle-label" style="margin-top: 0.75rem;">
                        <input type="checkbox" class="filter-toggle" id="${prefix}rmp-include-without-data" checked>
                        <span class="filter-toggle-text">Include professors without RMP data</span>
                    </label>
                    <div class="filter-hint">
                        <small>Note: Filters are off when at default ranges.</small>
                    </div>
                </div>
            </div>
        `;
    }

    static createProfessorFilter(options: ProfessorFilterOptions): string {
        const { idPrefix, filterId, activeProfessors } = options;

        const selectedProfessorsChips = activeProfessors.map((prof: string) => `
            <span class="filter-chip">
                ${this.escapeHtml(prof)}
                <button class="filter-chip-remove" data-professor="${this.escapeHtml(prof)}" data-filter="${filterId}">×</button>
            </span>
        `).join('');

        // Only show section if there are selected professors
        if (activeProfessors.length === 0) {
            return `<div class="filter-selected-chips" id="${idPrefix}-professor-chips" style="display: none;"></div>`;
        }

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Selected Professors</h4>
                </div>
                <div class="filter-section-content">
                    <div class="filter-selected-chips" id="${idPrefix}-professor-chips">
                        ${selectedProfessorsChips}
                    </div>
                </div>
            </div>
        `;
    }

    static createTermFilter(options: TermFilterOptions): string {
        const { idPrefix, filterId, terms, activeTerms } = options;

        const termCheckboxes = terms.map(term => `
            <label class="filter-toggle-label term-checkbox">
                <input type="checkbox" class="filter-toggle"
                       value="${term}"
                       data-filter="${filterId}"
                       ${activeTerms.includes(term) ? 'checked' : ''}>
                <span class="filter-toggle-slider"></span>
                <span class="filter-toggle-text">${term} Term</span>
            </label>
        `).join('');

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Academic Terms</h4>
                    <div class="filter-section-actions">
                        <button class="filter-select-all" data-filter="${filterId}" id="${idPrefix}-select-all-terms">All Terms</button>
                    </div>
                </div>
                <div class="filter-section-content">
                    <div class="filter-checkbox-row">
                        ${termCheckboxes}
                    </div>
                </div>
            </div>
        `;
    }

    static createAvailabilityFilter(options: AvailabilityFilterOptions): string {
        const { idPrefix, availableOnly, minAvailable, avoidConflicts } = options;

        const prefix = idPrefix ? `${idPrefix}-` : '';

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Availability</h4>
                </div>
                <div class="filter-section-content">
                    <label class="filter-toggle-label">
                        <input type="checkbox" class="filter-toggle" id="${prefix}avoid-conflicts-filter"
                               ${avoidConflicts ? 'checked' : ''}>
                        <span class="filter-toggle-slider"></span>
                        <span class="filter-toggle-text">Hide periods that conflict with selected sections</span>
                    </label>
                    <label class="filter-toggle-label" style="margin-top: 0.75rem;">
                        <input type="checkbox" class="filter-toggle" id="${prefix}available-only-filter"
                               ${availableOnly ? 'checked' : ''}>
                        <span class="filter-toggle-slider"></span>
                        <span class="filter-toggle-text">Show only sections with available seats</span>
                    </label>
                    <div class="filter-range-container" style="margin-top: 0.75rem;">
                        <div class="filter-range-input">
                            <label>Minimum Available Seats</label>
                            <input type="number" id="${prefix}min-seats-filter" min="0" max="999"
                                   placeholder="Any" value="${minAvailable || ''}">
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    static createConflictFilter(options: ConflictFilterOptions): string {
        const { idPrefix, avoidConflicts, includeCalendarToggle, hasCalendarEvents, calendarEventCount } = options;

        const prefix = idPrefix ? `${idPrefix}-` : '';
        const avoidId = `${prefix}avoid-conflicts-filter`;
        const calendarId = `${prefix}avoid-calendar-filter`;

        let calendarToggleHTML = '';
        if (includeCalendarToggle && calendarEventCount && calendarEventCount > 0) {
            const countText = calendarEventCount === 1
                ? '1 event'
                : `${calendarEventCount} events`;

            calendarToggleHTML = `
                <label class="filter-toggle-label">
                    <input type="checkbox" class="filter-toggle" id="${calendarId}"
                           ${hasCalendarEvents ? 'checked' : ''}>
                    <span class="filter-toggle-slider"></span>
                    <span class="filter-toggle-text">Hide periods that conflict with calendar events (${countText})</span>
                </label>
            `;
        }

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Schedule Conflicts</h4>
                </div>
                <div class="filter-section-content">
                    <label class="filter-toggle-label">
                        <input type="checkbox" class="filter-toggle" id="${avoidId}"
                               ${avoidConflicts ? 'checked' : ''}>
                        <span class="filter-toggle-slider"></span>
                        <span class="filter-toggle-text">Hide periods that conflict with selected sections</span>
                    </label>
                    ${calendarToggleHTML}
                </div>
            </div>
        `;
    }
}
