import { ModalService } from '../../services/ModalService';
import { ScheduleFilterService } from '../../services/ScheduleFilterService';
import { SelectedCourse } from '../../types/schedule';
import { DualRangeSlider } from '../components/DualRangeSlider';
import { getAllSections } from '../../utils/courseUtils';

export class ScheduleFilterModalController {
    private modalService: ModalService;
    private scheduleFilterService: ScheduleFilterService | null = null;
    private selectedCourses: SelectedCourse[] = [];
    private currentModalId: string | null = null;

    private ratingSlider: DualRangeSlider | null = null;
    private difficultySlider: DualRangeSlider | null = null;
    private retakeSlider: DualRangeSlider | null = null;

    constructor(modalService: ModalService) {
        this.modalService = modalService;
    }

    setScheduleFilterService(scheduleFilterService: ScheduleFilterService): void {
        this.scheduleFilterService = scheduleFilterService;
    }

    setSelectedCourses(selectedCourses: SelectedCourse[]): void {
        this.selectedCourses = selectedCourses;
    }

    show(): string {
        if (!this.scheduleFilterService) {
            console.error('ScheduleFilterService not set on ScheduleFilterModalController');
            return '';
        }

        const id = this.modalService.generateId();
        this.currentModalId = id;
        const modalElement = this.createModalElement(id);
        
        this.modalService.showModal(id, modalElement);
        this.modalService.setupModalBehavior(modalElement, id, { closeOnBackdrop: true, closeOnEscape: true });

        // Set up event listeners after modal is shown
        setTimeout(() => {
            this.setupFilterModalEventListeners();
            this.initializeFormState();
        }, 50);

        return id;
    }

    hide(): void {
        if (this.currentModalId) {
            this.modalService.hideModal(this.currentModalId);
            this.currentModalId = null;
        }
    }

    private createModalElement(id: string): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop filter-modal';
        backdrop.id = id;

        const activeFiltersCount = this.scheduleFilterService?.getFilterCount() || 0;

        const sectionCount = this.scheduleFilterService ? this.scheduleFilterService.filterSections(this.selectedCourses).length : 0;

        backdrop.innerHTML = `
            <div class="modal-dialog filter-modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            Filter Sections
                            <span id="filter-count" class="filter-count">${activeFiltersCount > 0 ? `(${activeFiltersCount})` : ''}</span>
                        </h3>
                        <button class="modal-close" onclick="document.getElementById('${id}').click()">×</button>
                    </div>
                    <div class="modal-body filter-modal-body">
                        ${this.createFilterModalContent()}
                    </div>
                    <div class="modal-footer">
                        <div class="filter-preview">
                            <span id="section-count-preview">${sectionCount} sections match current filters</span>
                        </div>
                        <div class="filter-actions">
                            <button class="modal-btn btn-secondary" id="clear-all-filters">Clear All</button>
                            <button class="modal-btn btn-primary" id="apply-filters">Apply</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const dialog = backdrop.querySelector('.modal-dialog') as HTMLElement;
        if (dialog) {
            dialog.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        }

        return backdrop;
    }

    private createFilterModalContent(): string {
        return `
            <div class="filter-sections">
                ${this.createSearchTextFilter()}
                ${this.createProfessorFilter()}
                ${this.createRMPRatingFilter()}
                ${this.createPeriodTypeFilter()}
                ${this.createTermFilter()}
                ${this.createAvailabilityFilter()}
                ${this.createConflictFilter()}
            </div>
        `;
    }

    private createSearchTextFilter(): string {
        if (!this.scheduleFilterService) return '';

        const searchFilter = this.scheduleFilterService.getActiveFilters().find(f => f.id === 'sectionCode');
        const currentQuery = searchFilter?.criteria?.codes?.[0] || '';

        return `
            <div class="filter-section search-text-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Search Section IDs</h4>
                    <button class="filter-clear-search" ${currentQuery ? '' : 'style="display: none;"'}>Clear</button>
                </div>
                <div class="filter-section-content">
                    <div class="filter-search-container">
                        <input type="text" class="filter-search search-text-input"
                               placeholder="Search section numbers (A01, B02, etc.)..."
                               value="${this.escapeHtml(currentQuery)}"
                               id="modal-search-input">
                        <div class="section-dropdown" id="section-dropdown" style="display: none;"></div>
                    </div>
                </div>
            </div>
        `;
    }

    private createProfessorFilter(): string {
        if (!this.scheduleFilterService) return '';

        const activeProfessors = this.getActiveProfessors();

        const selectedProfessorsChips = activeProfessors.map(prof => `
            <span class="filter-chip">
                ${this.escapeHtml(prof)}
                <button class="filter-chip-remove" data-professor="${this.escapeHtml(prof)}">×</button>
            </span>
        `).join('');

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Professors</h4>
                </div>
                <div class="filter-section-content">
                    <div class="filter-search-container">
                        <input type="text" class="filter-search professor-search"
                               placeholder="Search professors..." data-filter="professor">
                        <div class="professor-dropdown" id="professor-dropdown" style="display: none;"></div>
                    </div>
                    <div class="filter-selected-chips">
                        ${selectedProfessorsChips}
                    </div>
                </div>
            </div>
        `;
    }

    private createRMPRatingFilter(): string {
        if (!this.scheduleFilterService) return '';

        const activeFilter = this.scheduleFilterService.getActiveFilters().find(f => f.id === 'periodRmpRating');
        const minRating = activeFilter?.criteria?.minRating ?? 0;
        const maxRating = activeFilter?.criteria?.maxRating ?? 5;
        const minDifficulty = activeFilter?.criteria?.minDifficulty ?? 0;
        const maxDifficulty = activeFilter?.criteria?.maxDifficulty ?? 5;
        const minWouldTakeAgain = activeFilter?.criteria?.minWouldTakeAgain ?? 0;
        const maxWouldTakeAgain = activeFilter?.criteria?.maxWouldTakeAgain ?? 100;

        const hasActiveFilter = activeFilter && (
            minRating > 0 || maxRating < 5 ||
            minDifficulty > 0 || maxDifficulty < 5 ||
            minWouldTakeAgain > 0 || maxWouldTakeAgain < 100
        );

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Rate My Professor</h4>
                    ${hasActiveFilter ? '<button class="filter-clear-section" data-filter="periodRmpRating">Clear</button>' : ''}
                </div>
                <div class="filter-section-content">
                    <div class="filter-slider-container">
                        <div class="filter-slider-group">
                            <label>Rating</label>
                            <div class="filter-slider-values">
                                <span id="schedule-rmp-rating-min-value">${minRating.toFixed(1)}</span>
                                <span>-</span>
                                <span id="schedule-rmp-rating-max-value">${maxRating.toFixed(1)}</span>
                                <span class="filter-input-hint">stars</span>
                            </div>
                            <div id="schedule-rmp-rating-slider-container"></div>
                        </div>

                        <div class="filter-slider-group">
                            <label>Difficulty</label>
                            <div class="filter-slider-values">
                                <span id="schedule-rmp-difficulty-min-value">${minDifficulty.toFixed(1)}</span>
                                <span>-</span>
                                <span id="schedule-rmp-difficulty-max-value">${maxDifficulty.toFixed(1)}</span>
                                <span class="filter-input-hint">scale</span>
                            </div>
                            <div id="schedule-rmp-difficulty-slider-container"></div>
                        </div>

                        <div class="filter-slider-group">
                            <label>Would Take Again</label>
                            <div class="filter-slider-values">
                                <span id="schedule-rmp-retake-min-value">${minWouldTakeAgain}</span>
                                <span>-</span>
                                <span id="schedule-rmp-retake-max-value">${maxWouldTakeAgain}</span>
                                <span class="filter-input-hint">%</span>
                            </div>
                            <div id="schedule-rmp-retake-slider-container"></div>
                        </div>
                    </div>
                    <div class="filter-hint">
                        <small>Note: Filters are off when at default ranges. Sections with professors without RMP data are excluded when this filter is active.</small>
                    </div>
                </div>
            </div>
        `;
    }

    private createPeriodTypeFilter(): string {
        if (!this.scheduleFilterService) return '';

        const typeOptions = this.scheduleFilterService.getFilterOptions('periodType', this.selectedCourses) || [];
        const activeTypes = this.getActivePeriodTypes();

        if (typeOptions.length === 0) {
            return '';
        }

        const typeCheckboxes = typeOptions.map((option: any) => `
            <label class="filter-toggle-label">
                <input type="checkbox" class="filter-toggle" name="periodType" value="${option.value}"
                       ${activeTypes.includes(option.value) ? 'checked' : ''}>
                <span class="filter-toggle-slider"></span>
                <span class="filter-toggle-text">${option.label}</span>
            </label>
        `).join('');

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Exclude Period Types</h4>
                </div>
                <div class="filter-section-content">
                    <div class="filter-checkbox-row">
                        ${typeCheckboxes}
                    </div>
                </div>
            </div>
        `;
    }

    private createTermFilter(): string {
        if (!this.scheduleFilterService) return '';

        const termOptions = this.scheduleFilterService.getFilterOptions('periodTerm', this.selectedCourses) || [];
        const activeTerms = this.getActiveTerms();

        if (termOptions.length === 0) {
            return '';
        }

        const termCheckboxes = termOptions.map((option: any) => `
            <label class="filter-toggle-label term-checkbox">
                <input type="checkbox" class="filter-toggle" name="periodTerm" value="${option.value}"
                       ${activeTerms.includes(option.value) ? 'checked' : ''}>
                <span class="filter-toggle-slider"></span>
                <span class="filter-toggle-text">${option.label}</span>
            </label>
        `).join('');

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Terms</h4>
                </div>
                <div class="filter-section-content">
                    <div class="filter-checkbox-row">
                        ${termCheckboxes}
                    </div>
                </div>
            </div>
        `;
    }

    private createAvailabilityFilter(): string {
        if (!this.scheduleFilterService) return '';

        const activeAvailability = this.getActiveAvailability();

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Availability</h4>
                </div>
                <div class="filter-section-content">
                    <label class="filter-toggle-label">
                        <input type="checkbox" class="filter-toggle" id="available-only-filter"
                               ${activeAvailability.availableOnly ? 'checked' : ''}>
                        <span class="filter-toggle-slider"></span>
                        <span class="filter-toggle-text">Show only sections with available seats</span>
                    </label>
                    <div class="filter-range-container" style="margin-top: 0.75rem;">
                        <div class="filter-range-input">
                            <label>Minimum Available Seats</label>
                            <input type="number" id="min-seats-filter" min="0" max="999"
                                   placeholder="Any" value="${activeAvailability.minAvailable || ''}">
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private createConflictFilter(): string {
        if (!this.scheduleFilterService) return '';

        const activeConflictDetection = this.getActiveConflictDetection();

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Schedule Conflicts</h4>
                </div>
                <div class="filter-section-content">
                    <label class="filter-toggle-label">
                        <input type="checkbox" class="filter-toggle" id="avoid-conflicts-filter"
                               ${activeConflictDetection.avoidConflicts ? 'checked' : ''}>
                        <span class="filter-toggle-slider"></span>
                        <span class="filter-toggle-text">Hide periods that conflict with selected sections</span>
                    </label>
                </div>
            </div>
        `;
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    private unescapeHtml(text: string): string {
        const div = document.createElement('div');
        div.innerHTML = text;
        return div.textContent || div.innerText || '';
    }

    private getActiveProfessors(): string[] {
        const filter = this.scheduleFilterService!.getActiveFilters().find(f => f.id === 'periodProfessor');
        return filter?.criteria?.professors || [];
    }

    private getActivePeriodTypes(): string[] {
        const filter = this.scheduleFilterService!.getActiveFilters().find(f => f.id === 'periodType');
        return filter?.criteria?.types || [];
    }

    private getActiveTerms(): string[] {
        const filter = this.scheduleFilterService!.getActiveFilters().find(f => f.id === 'periodTerm');
        return filter?.criteria?.terms || [];
    }


    private getActiveAvailability(): { availableOnly: boolean; minAvailable?: number } {
        const filter = this.scheduleFilterService!.getActiveFilters().find(f => f.id === 'periodAvailability');
        return filter?.criteria || { availableOnly: false };
    }

    private getActiveConflictDetection(): { avoidConflicts: boolean } {
        const filter = this.scheduleFilterService!.getActiveFilters().find(f => f.id === 'periodConflict');
        return filter?.criteria || { avoidConflicts: false };
    }

    private setupFilterModalEventListeners(): void {
        if (!this.currentModalId) return;
        
        const modalElement = document.getElementById(this.currentModalId);
        if (!modalElement) return;

        // Search text filter
        this.setupSearchTextFilter(modalElement);

        // Professor filter
        this.setupProfessorFilter(modalElement);

        // RMP Rating filter
        this.setupRMPRatingFilter(modalElement);

        // Period type checkboxes
        modalElement.querySelectorAll('input[name="periodType"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updatePeriodTypeFilter();
                this.updatePreview(modalElement);
            });
        });

        // Term checkboxes
        modalElement.querySelectorAll('input[name="periodTerm"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateTermFilter();
                this.updatePreview(modalElement);
            });
        });

        // Availability filters
        const availableOnlyCheckbox = modalElement.querySelector('#available-only-filter') as HTMLInputElement;
        const minSeatsInput = modalElement.querySelector('#min-seats-filter') as HTMLInputElement;

        if (availableOnlyCheckbox) {
            availableOnlyCheckbox.addEventListener('change', () => {
                this.updateAvailabilityFilter();
                this.updatePreview(modalElement);
            });
        }

        if (minSeatsInput) {
            minSeatsInput.addEventListener('input', () => {
                this.updateAvailabilityFilter();
                this.updatePreview(modalElement);
            });
        }

        // Conflict detection filter
        const avoidConflictsCheckbox = modalElement.querySelector('#avoid-conflicts-filter') as HTMLInputElement;
        if (avoidConflictsCheckbox) {
            avoidConflictsCheckbox.addEventListener('change', () => {
                this.updateConflictFilter();
                this.updatePreview(modalElement);
            });
        }

        // Clear all filters
        modalElement.querySelector('#clear-all-filters')?.addEventListener('click', () => {
            this.scheduleFilterService!.clearFilters();
            this.updatePreview(modalElement);
            // Refresh the modal content
            const modalBody = modalElement.querySelector('.modal-body');
            if (modalBody) {
                modalBody.innerHTML = this.createFilterModalContent();
                this.setupFilterModalEventListeners();
            }
        });

        // Apply filters button
        modalElement.querySelector('#apply-filters')?.addEventListener('click', () => {
            this.applyFilters();
            this.hide();
        });
    }



    private updatePeriodTypeFilter(): void {
        if (!this.currentModalId) return;
        
        const modalElement = document.getElementById(this.currentModalId);
        if (modalElement) {
            const checkedTypes = Array.from(modalElement.querySelectorAll('input[name="periodType"]:checked'))
                .map(cb => (cb as HTMLInputElement).value);

            if (checkedTypes.length > 0) {
                this.scheduleFilterService!.addFilter('periodType', { types: checkedTypes });
            } else {
                this.scheduleFilterService!.removeFilter('periodType');
            }
        }
    }

    private updateTermFilter(): void {
        if (!this.currentModalId) return;
        
        const modalElement = document.getElementById(this.currentModalId);
        if (modalElement) {
            const checkedTerms = Array.from(modalElement.querySelectorAll('input[name="periodTerm"]:checked'))
                .map(cb => (cb as HTMLInputElement).value);

            if (checkedTerms.length > 0) {
                this.scheduleFilterService!.addFilter('periodTerm', { terms: checkedTerms });
            } else {
                this.scheduleFilterService!.removeFilter('periodTerm');
            }
        }
    }

    private updateAvailabilityFilter(): void {
        if (!this.currentModalId) return;
        
        const modalElement = document.getElementById(this.currentModalId);
        if (modalElement) {
            const availableOnly = (modalElement.querySelector('#available-only-filter') as HTMLInputElement)?.checked || false;
            const minSeatsValue = (modalElement.querySelector('#min-seats-filter') as HTMLInputElement)?.value;
            const minAvailable = minSeatsValue ? parseInt(minSeatsValue) : undefined;

            if (availableOnly || (minAvailable && minAvailable > 0)) {
                const criteria: any = { availableOnly };
                if (minAvailable && minAvailable > 0) {
                    criteria.minAvailable = minAvailable;
                }
                this.scheduleFilterService!.addFilter('periodAvailability', criteria);
            } else {
                this.scheduleFilterService!.removeFilter('periodAvailability');
            }
        }
    }

    private updateConflictFilter(): void {
        if (!this.currentModalId) return;
        
        const modalElement = document.getElementById(this.currentModalId);
        if (modalElement) {
            const avoidConflicts = (modalElement.querySelector('#avoid-conflicts-filter') as HTMLInputElement)?.checked || false;

            if (avoidConflicts) {
                this.scheduleFilterService!.addFilter('periodConflict', { avoidConflicts: true });
            } else {
                this.scheduleFilterService!.removeFilter('periodConflict');
            }
        }
    }

    private initializeFormState(): void {
        if (!this.currentModalId) return;
        
        const modalElement = document.getElementById(this.currentModalId);
        if (!modalElement) return;

        // Initialize availability filter states
        const activeAvailability = this.getActiveAvailability();
        const availableOnlyCheckbox = modalElement.querySelector('#available-only-filter') as HTMLInputElement;
        const minSeatsInput = modalElement.querySelector('#min-seats-filter') as HTMLInputElement;
        
        if (availableOnlyCheckbox) {
            availableOnlyCheckbox.checked = activeAvailability.availableOnly;
        }
        if (minSeatsInput && activeAvailability.minAvailable) {
            minSeatsInput.value = activeAvailability.minAvailable.toString();
        }

        // Initialize conflict detection filter state
        const activeConflictDetection = this.getActiveConflictDetection();
        const avoidConflictsCheckbox = modalElement.querySelector('#avoid-conflicts-filter') as HTMLInputElement;
        
        if (avoidConflictsCheckbox) {
            avoidConflictsCheckbox.checked = activeConflictDetection.avoidConflicts;
        }
    }

    private setupSearchTextFilter(modalElement: HTMLElement): void {
        const searchInput = modalElement.querySelector('.search-text-input') as HTMLInputElement;
        const clearButton = modalElement.querySelector('.filter-clear-search');

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.trim();
                this.updateSearchTextFilter(query, modalElement);
            });
        }

        if (clearButton) {
            clearButton.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                }
                this.updateSearchTextFilter('', modalElement);
            });
        }

        // Setup section dropdown
        this.setupSectionIdSearch(modalElement);
    }

    private updateSearchTextFilter(query: string, modalElement: HTMLElement): void {
        if (query.length > 0) {
            this.scheduleFilterService?.addFilter('sectionCode', { codes: [query] });
        } else {
            this.scheduleFilterService?.removeFilter('sectionCode');
        }
        this.updatePreview(modalElement);
        this.updateClearSearchButton(modalElement, query);
    }

    private updateClearSearchButton(modalElement: HTMLElement, query: string): void {
        const clearButton = modalElement.querySelector('.filter-clear-search') as HTMLElement;
        if (clearButton) {
            clearButton.style.display = query.length > 0 ? 'inline-block' : 'none';
        }
    }

    private updatePreview(modalElement: HTMLElement): void {
        if (!this.scheduleFilterService) return;

        const filteredSections = this.scheduleFilterService.filterSections(this.selectedCourses);
        const sectionCount = filteredSections.length;
        const filterCount = this.scheduleFilterService.getFilterCount();

        const countElement = modalElement.querySelector('#section-count-preview');
        const filterCountElement = modalElement.querySelector('#filter-count');

        if (countElement) {
            countElement.textContent = `${sectionCount} sections match current filters`;
        }

        if (filterCountElement) {
            filterCountElement.textContent = filterCount > 0 ? `(${filterCount})` : '';
        }
    }

    private applyFilters(): void {
        // Save filter state
        this.scheduleFilterService?.saveFiltersToStorage();
    }

    private setupProfessorFilter(modalElement: HTMLElement): void {
        const searchInput = modalElement.querySelector('.professor-search') as HTMLInputElement;
        const dropdown = modalElement.querySelector('#professor-dropdown') as HTMLElement;

        if (searchInput && this.scheduleFilterService) {
            const professorOptions = this.scheduleFilterService.getFilterOptions('periodProfessor', this.selectedCourses) || [];
            const professors = professorOptions.map((option: any) => option.value).filter((prof: string) => prof && prof.trim() !== 'TBA');

            searchInput.addEventListener('input', () => {
                const query = searchInput.value.toLowerCase();
                if (query.length > 0) {
                    const matches = professors.filter((prof: string) =>
                        prof.toLowerCase().includes(query)
                    ).slice(0, 10);

                    dropdown.innerHTML = matches.map((prof: string) =>
                        `<div class="professor-option" data-professor="${this.escapeHtml(prof)}">${this.escapeHtml(prof)}</div>`
                    ).join('');
                    dropdown.style.display = matches.length > 0 ? 'block' : 'none';
                } else {
                    dropdown.style.display = 'none';
                }
            });

            dropdown.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains('professor-option')) {
                    const professor = this.unescapeHtml(target.dataset.professor!);
                    if (professor) {
                        this.addProfessorToSelection(professor, modalElement);
                        searchInput.value = '';
                        dropdown.style.display = 'none';
                    }
                }
            });

            document.addEventListener('click', (e) => {
                if (!searchInput.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
                    dropdown.style.display = 'none';
                }
            });
        }

        // Handle chip removal - use delegation on the chips container
        const chipsContainer = modalElement.querySelector('.filter-selected-chips');
        if (chipsContainer) {
            chipsContainer.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains('filter-chip-remove')) {
                    e.stopPropagation();
                    e.preventDefault();
                    const professor = this.unescapeHtml(target.dataset.professor!);
                    this.removeProfessorFromSelection(professor, modalElement);
                }
            });
        }
    }

    private setupRMPRatingFilter(modalElement: HTMLElement): void {
        const activeFilter = this.scheduleFilterService?.getActiveFilters().find(f => f.id === 'periodRmpRating');
        const minRating = activeFilter?.criteria?.minRating ?? 0;
        const maxRating = activeFilter?.criteria?.maxRating ?? 5;
        const minDifficulty = activeFilter?.criteria?.minDifficulty ?? 0;
        const maxDifficulty = activeFilter?.criteria?.maxDifficulty ?? 5;
        const minWouldTakeAgain = activeFilter?.criteria?.minWouldTakeAgain ?? 0;
        const maxWouldTakeAgain = activeFilter?.criteria?.maxWouldTakeAgain ?? 100;

        const ratingMinValue = modalElement.querySelector('#schedule-rmp-rating-min-value');
        const ratingMaxValue = modalElement.querySelector('#schedule-rmp-rating-max-value');
        const difficultyMinValue = modalElement.querySelector('#schedule-rmp-difficulty-min-value');
        const difficultyMaxValue = modalElement.querySelector('#schedule-rmp-difficulty-max-value');
        const retakeMinValue = modalElement.querySelector('#schedule-rmp-retake-min-value');
        const retakeMaxValue = modalElement.querySelector('#schedule-rmp-retake-max-value');

        const ratingContainer = modalElement.querySelector('#schedule-rmp-rating-slider-container');
        const difficultyContainer = modalElement.querySelector('#schedule-rmp-difficulty-slider-container');
        const retakeContainer = modalElement.querySelector('#schedule-rmp-retake-slider-container');

        const clearBtn = modalElement.querySelector('.filter-clear-section[data-filter="periodRmpRating"]');

        let debounceTimer: number | undefined;

        const updateFilter = () => {
            if (!this.scheduleFilterService || !this.ratingSlider || !this.difficultySlider || !this.retakeSlider) return;

            const minRating = this.ratingSlider.getMinValue();
            const maxRating = this.ratingSlider.getMaxValue();
            const minDifficulty = this.difficultySlider.getMinValue();
            const maxDifficulty = this.difficultySlider.getMaxValue();
            const minRetake = this.retakeSlider.getMinValue();
            const maxRetake = this.retakeSlider.getMaxValue();

            const isDefaultRating = minRating === 0 && maxRating === 5;
            const isDefaultDifficulty = minDifficulty === 0 && maxDifficulty === 5;
            const isDefaultRetake = minRetake === 0 && maxRetake === 100;

            if (isDefaultRating && isDefaultDifficulty && isDefaultRetake) {
                console.log('[Schedule Filter Modal] Removing RMP filter (all at defaults)');
                this.scheduleFilterService.removeFilter('periodRmpRating');
            } else {
                const criteria: any = {
                    minRating,
                    maxRating,
                    minDifficulty,
                    maxDifficulty,
                    minWouldTakeAgain: minRetake,
                    maxWouldTakeAgain: maxRetake
                };
                console.log('[Schedule Filter Modal] Adding RMP filter with criteria:', criteria);
                this.scheduleFilterService.addFilter('periodRmpRating', criteria);
            }

            this.updatePreview(modalElement);
        };

        const debouncedUpdateFilter = () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = window.setTimeout(() => {
                updateFilter();
            }, 300);
        };

        if (ratingContainer) {
            this.ratingSlider = new DualRangeSlider({
                min: 0,
                max: 5,
                step: 0.1,
                minValue: minRating,
                maxValue: maxRating,
                leftLabel: 'Minimum Rating',
                rightLabel: 'Maximum Rating',
                onChange: (min, max) => {
                    if (ratingMinValue) ratingMinValue.textContent = min.toFixed(1);
                    if (ratingMaxValue) ratingMaxValue.textContent = max.toFixed(1);
                    debouncedUpdateFilter();
                }
            });
            ratingContainer.appendChild(this.ratingSlider.getElement());
        }

        if (difficultyContainer) {
            this.difficultySlider = new DualRangeSlider({
                min: 0,
                max: 5,
                step: 0.1,
                minValue: minDifficulty,
                maxValue: maxDifficulty,
                leftLabel: 'Minimum Difficulty',
                rightLabel: 'Maximum Difficulty',
                onChange: (min, max) => {
                    if (difficultyMinValue) difficultyMinValue.textContent = min.toFixed(1);
                    if (difficultyMaxValue) difficultyMaxValue.textContent = max.toFixed(1);
                    debouncedUpdateFilter();
                }
            });
            difficultyContainer.appendChild(this.difficultySlider.getElement());
        }

        if (retakeContainer) {
            this.retakeSlider = new DualRangeSlider({
                min: 0,
                max: 100,
                step: 1,
                minValue: minWouldTakeAgain,
                maxValue: maxWouldTakeAgain,
                leftLabel: 'Minimum Would Take Again',
                rightLabel: 'Maximum Would Take Again',
                onChange: (min, max) => {
                    if (retakeMinValue) retakeMinValue.textContent = min.toString();
                    if (retakeMaxValue) retakeMaxValue.textContent = max.toString();
                    debouncedUpdateFilter();
                }
            });
            retakeContainer.appendChild(this.retakeSlider.getElement());
        }

        clearBtn?.addEventListener('click', () => {
            if (this.ratingSlider) {
                this.ratingSlider.setMinValue(0);
                this.ratingSlider.setMaxValue(5);
                if (ratingMinValue) ratingMinValue.textContent = '0.0';
                if (ratingMaxValue) ratingMaxValue.textContent = '5.0';
            }
            if (this.difficultySlider) {
                this.difficultySlider.setMinValue(0);
                this.difficultySlider.setMaxValue(5);
                if (difficultyMinValue) difficultyMinValue.textContent = '0.0';
                if (difficultyMaxValue) difficultyMaxValue.textContent = '5.0';
            }
            if (this.retakeSlider) {
                this.retakeSlider.setMinValue(0);
                this.retakeSlider.setMaxValue(100);
                if (retakeMinValue) retakeMinValue.textContent = '0';
                if (retakeMaxValue) retakeMaxValue.textContent = '100';
            }
            debouncedUpdateFilter();
        });
    }

    private addProfessorToSelection(professor: string, modalElement: HTMLElement): void {
        const activeProfessors = this.getActiveProfessors();
        if (!activeProfessors.includes(professor)) {
            activeProfessors.push(professor);
            this.scheduleFilterService!.addFilter('periodProfessor', { professors: activeProfessors });
            this.refreshProfessorChips(modalElement);
            this.updatePreview(modalElement);
        }
    }

    private removeProfessorFromSelection(professor: string, modalElement: HTMLElement): void {
        const activeProfessors = this.getActiveProfessors();
        const updatedProfessors = activeProfessors.filter(prof => prof !== professor);

        if (updatedProfessors.length > 0) {
            this.scheduleFilterService!.addFilter('periodProfessor', { professors: updatedProfessors });
        } else {
            this.scheduleFilterService!.removeFilter('periodProfessor');
        }
        this.refreshProfessorChips(modalElement);
        this.updatePreview(modalElement);
    }

    private refreshProfessorChips(modalElement: HTMLElement): void {
        if (!this.scheduleFilterService) return;

        const activeProfessors = this.getActiveProfessors();
        const chipsContainer = modalElement.querySelector('.filter-selected-chips');

        if (chipsContainer) {
            chipsContainer.innerHTML = activeProfessors.map(prof => `
                <span class="filter-chip">
                    ${this.escapeHtml(prof)}
                    <button class="filter-chip-remove" data-professor="${this.escapeHtml(prof)}">×</button>
                </span>
            `).join('');
        }
    }

    private getSectionCodeOptions(): string[] {
        const sectionCodes = new Set<string>();
        
        for (const selectedCourse of this.selectedCourses) {
            const sections = getAllSections(selectedCourse.course);
            for (const section of sections) {
                if (section.number && section.number.trim() !== '') {
                    sectionCodes.add(section.number.trim());
                }
            }
        }
        
        return Array.from(sectionCodes).sort();
    }

    private setupSectionIdSearch(modalElement: HTMLElement): void {
        const searchInput = modalElement.querySelector('#modal-search-input') as HTMLInputElement;
        const dropdown = modalElement.querySelector('#section-dropdown') as HTMLElement;
        
        if (searchInput && dropdown) {
            const sectionCodeOptions = this.getSectionCodeOptions();
            
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.trim();
                
                // Apply section filter
                if (query) {
                    this.scheduleFilterService!.addFilter('sectionCode', { codes: [query] });
                } else {
                    this.scheduleFilterService!.removeFilter('sectionCode');
                }
                
                // Show dropdown with matching section codes
                const queryLower = query.toLowerCase();
                if (queryLower.length > 0) {
                    const matches = sectionCodeOptions.filter(sectionCode => 
                        sectionCode.toLowerCase().includes(queryLower)
                    ).slice(0, 10);
                    
                    dropdown.innerHTML = matches.map(sectionCode => 
                        `<div class="section-option" data-section="${sectionCode}">${sectionCode}</div>`
                    ).join('');
                    dropdown.style.display = matches.length > 0 ? 'block' : 'none';
                } else {
                    dropdown.style.display = 'none';
                }
            });

            dropdown.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains('section-option')) {
                    const sectionCode = target.dataset.section;
                    if (sectionCode) {
                        searchInput.value = sectionCode;
                        this.scheduleFilterService!.addFilter('sectionCode', { codes: [sectionCode] });
                                dropdown.style.display = 'none';
                    }
                }
            });

            document.addEventListener('click', (e) => {
                if (!searchInput.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
                    dropdown.style.display = 'none';
                }
            });
        }
    }


    syncSearchInputFromMain(query: string): void {
        if (this.currentModalId) {
            const modalElement = document.getElementById(this.currentModalId);
            if (modalElement) {
                const searchInput = modalElement.querySelector('#modal-search-input') as HTMLInputElement;
                if (searchInput && searchInput.value !== query) {
                    searchInput.value = query;
                }
            }
        }
    }
}