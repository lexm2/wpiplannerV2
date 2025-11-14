export interface RMPFilterOptions {
    idPrefix: string;
    filterId: string;
    activeFilter?: any;
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
}

export interface ConflictFilterOptions {
    idPrefix: string;
    filterId: string;
    avoidConflicts: boolean;
}

export class SharedFilterComponents {
    static escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static createRMPRatingFilter(options: RMPFilterOptions): string {
        const { idPrefix, activeFilter } = options;

        const minRating = activeFilter?.criteria?.minRating ?? 0;
        const maxRating = activeFilter?.criteria?.maxRating ?? 5;
        const minDifficulty = activeFilter?.criteria?.minDifficulty ?? 0;
        const maxDifficulty = activeFilter?.criteria?.maxDifficulty ?? 5;
        const minWouldTakeAgain = activeFilter?.criteria?.minWouldTakeAgain ?? 0;
        const maxWouldTakeAgain = activeFilter?.criteria?.maxWouldTakeAgain ?? 100;

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
                                <span id="${idPrefix}-rmp-rating-min-value">${minRating.toFixed(1)}</span>
                                <span>-</span>
                                <span id="${idPrefix}-rmp-rating-max-value">${maxRating.toFixed(1)}</span>
                                <span class="filter-input-hint">stars</span>
                            </div>
                            <div id="${idPrefix}-rmp-rating-slider-container"></div>
                        </div>
                        <div class="filter-slider-group">
                            <label>Difficulty</label>
                            <div class="filter-slider-values">
                                <span id="${idPrefix}-rmp-difficulty-min-value">${minDifficulty.toFixed(1)}</span>
                                <span>-</span>
                                <span id="${idPrefix}-rmp-difficulty-max-value">${maxDifficulty.toFixed(1)}</span>
                                <span class="filter-input-hint">scale</span>
                            </div>
                            <div id="${idPrefix}-rmp-difficulty-slider-container"></div>
                        </div>
                        <div class="filter-slider-group">
                            <label>Would Take Again</label>
                            <div class="filter-slider-values">
                                <span id="${idPrefix}-rmp-retake-min-value">${minWouldTakeAgain}</span>
                                <span>-</span>
                                <span id="${idPrefix}-rmp-retake-max-value">${maxWouldTakeAgain}</span>
                                <span class="filter-input-hint">%</span>
                            </div>
                            <div id="${idPrefix}-rmp-retake-slider-container"></div>
                        </div>
                    </div>
                    <label class="filter-toggle-label" style="margin-top: 0.75rem;">
                        <input type="checkbox" class="filter-toggle" id="${idPrefix}-rmp-include-without-data" checked>
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

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Professors</h4>
                </div>
                <div class="filter-section-content">
                    <div class="filter-search-container">
                        <input type="text" class="filter-search ${idPrefix}-professor-search"
                               placeholder="Search professors..." data-filter="${filterId}">
                        <div class="${idPrefix}-professor-dropdown" id="${idPrefix}-professor-dropdown" style="display: none;"></div>
                    </div>
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
        const { idPrefix, availableOnly, minAvailable } = options;

        const prefix = idPrefix ? `${idPrefix}-` : '';

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Availability</h4>
                </div>
                <div class="filter-section-content">
                    <label class="filter-toggle-label">
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
        const { idPrefix, avoidConflicts } = options;

        const prefix = idPrefix ? `${idPrefix}-` : '';

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Schedule Conflicts</h4>
                </div>
                <div class="filter-section-content">
                    <label class="filter-toggle-label">
                        <input type="checkbox" class="filter-toggle" id="${prefix}avoid-conflicts-filter"
                               ${avoidConflicts ? 'checked' : ''}>
                        <span class="filter-toggle-slider"></span>
                        <span class="filter-toggle-text">Hide periods that conflict with selected sections</span>
                    </label>
                </div>
            </div>
        `;
    }
}
