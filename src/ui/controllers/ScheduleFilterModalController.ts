import { ModalService } from '../../services/ModalService';
import { ScheduleFilterService } from '../../services/ScheduleFilterService';
import { SelectedCourse } from '../../types/schedule';

export class ScheduleFilterModalController {
    private modalService: ModalService;
    private scheduleFilterService: ScheduleFilterService | null = null;
    private selectedCourses: SelectedCourse[] = [];
    private currentModalId: string | null = null;

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
        backdrop.className = 'modal-backdrop schedule-filter-modal';
        backdrop.id = id;

        backdrop.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">Filter Selected Courses</h3>
                        <button class="modal-close" type="button">×</button>
                    </div>
                    <div class="modal-body">
                        ${this.createFilterModalContent()}
                    </div>
                </div>
            </div>
        `;

        // Add close button event listener
        const closeBtn = backdrop.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        return backdrop;
    }

    private createFilterModalContent(): string {
        const activeFilters = this.scheduleFilterService.getActiveFilters();

        return `
            <div class="filter-modal-content">
                <div class="active-filters-section">
                    <h3>Active Filters</h3>
                    <div id="active-filters-list" class="active-filters-list">
                        ${this.renderActiveFilters(activeFilters)}
                    </div>
                </div>

                <div class="available-filters-section">
                    <h3>Period Search Filters</h3>
                    
                    <div class="filter-group">
                        <h4>Search Periods</h4>
                        <div class="filter-option">
                            <input type="text" id="modal-search-input" placeholder="Search professors, buildings, courses..." 
                                   value="${this.getSearchValue()}" class="search-input">
                        </div>
                    </div>

                    <div class="filter-group">
                        <h4>Select Courses to Search</h4>
                        <div class="filter-option">
                            ${this.renderCourseSelectionCheckboxes()}
                        </div>
                    </div>


                    <div class="filter-group">
                        <h4>Exclude Days</h4>
                        <div class="filter-option">
                            <div class="filter-help-text">Hide sections with classes on selected days</div>
                            ${this.renderDaysCheckboxes()}
                        </div>
                    </div>

                    <div class="filter-group">
                        <h4>Professor</h4>
                        <div class="filter-option">
                            ${this.renderProfessorCheckboxes()}
                        </div>
                    </div>

                    <div class="filter-group">
                        <h4>Exclude Period Types</h4>
                        <div class="filter-option">
                            <div class="filter-help-text">Hide sections with selected period types</div>
                            ${this.renderPeriodTypeCheckboxes()}
                        </div>
                    </div>

                    <div class="filter-group">
                        <h4>Academic Terms</h4>
                        <div class="filter-option">
                            <div class="filter-help-text">Show sections from selected academic terms</div>
                            ${this.renderTermCheckboxes()}
                        </div>
                    </div>

                    <div class="filter-group">
                        <h4>Availability</h4>
                        <div class="filter-option">
                            <label class="filter-toggle-label">
                                <input type="checkbox" class="filter-toggle" id="available-only-filter">
                                <span class="filter-toggle-slider"></span>
                                <span class="filter-toggle-text">Available Seats Only</span>
                            </label>
                            <div class="min-seats-input" style="margin-top: 0.5rem;">
                                <label>Minimum Available Seats:</label>
                                <input type="number" id="min-seats-filter" min="0" max="999" placeholder="Any">
                            </div>
                        </div>
                    </div>
                    <div class="filter-group">
                        <h4>Schedule Conflicts</h4>
                        <div class="filter-option">
                            <label class="filter-toggle-label">
                                <input type="checkbox" class="filter-toggle" id="avoid-conflicts-filter">
                                <span class="filter-toggle-slider"></span>
                                <span class="filter-toggle-text">Hide periods that conflict with selected sections</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="filter-modal-actions">
                    <button id="clear-all-filters" class="btn btn-secondary">Clear All</button>
                    <button id="apply-filters" class="btn btn-primary">Apply Filters</button>
                </div>
            </div>
        `;
    }

    private renderActiveFilters(activeFilters: any[]): string {
        if (activeFilters.length === 0) {
            return '<div class="no-filters">No active filters</div>';
        }

        return activeFilters.map(filter => `
            <div class="active-filter-tag" data-filter-id="${filter.id}">
                <span class="filter-name">${filter.name}:</span>
                <span class="filter-value">${filter.displayValue}</span>
                <button class="remove-filter-btn" data-filter-id="${filter.id}">×</button>
            </div>
        `).join('');
    }

    private renderCourseSelectionCheckboxes(): string {
        // Course selection is now handled by ProfileStateManager directly
        // This filter is no longer needed as selectedCourses are already filtered
        return '<div class="info-message">Course selection is managed through the main interface. Use other filters below to refine your schedule.</div>';
    }


    private renderDaysCheckboxes(): string {
        const dayOptions = this.scheduleFilterService!.getFilterOptions('periodDays', this.selectedCourses) || [];
        const activeDays = this.getActiveDays();

        return dayOptions.map((option: any) => `
            <label class="filter-toggle-label">
                <input type="checkbox" class="filter-toggle" name="periodDays" value="${option.value}" 
                       ${activeDays.includes(option.value) ? 'checked' : ''}>
                <span class="filter-toggle-slider"></span>
                <span class="filter-toggle-text">${option.label}</span>
            </label>
        `).join('');
    }

    private renderProfessorCheckboxes(): string {
        const professorOptions = this.scheduleFilterService!.getFilterOptions('periodProfessor', this.selectedCourses) || [];
        const activeProfessors = this.getActiveProfessors();
        
        if (professorOptions.length === 0) {
            return '<div class="no-options">No professors available</div>';
        }

        const selectedProfessorsChips = activeProfessors.map(prof => `
            <div class="filter-chip" data-professor="${prof}">
                <span>${prof}</span>
                <button type="button" class="chip-remove" data-professor="${prof}">×</button>
            </div>
        `).join('');

        return `
            <div class="filter-search-container">
                <input type="text" class="filter-search professor-search" 
                       placeholder="Search professors..." data-filter="professor">
                <div class="professor-dropdown" id="professor-dropdown" style="display: none;"></div>
            </div>
            <div class="filter-selected-chips">
                ${selectedProfessorsChips}
            </div>
        `;
    }

    private renderPeriodTypeCheckboxes(): string {
        const typeOptions = this.scheduleFilterService!.getFilterOptions('periodType', this.selectedCourses) || [];
        const activeTypes = this.getActivePeriodTypes();

        if (typeOptions.length === 0) {
            return '<div class="no-options">No period types available</div>';
        }

        return typeOptions.map((option: any) => `
            <label class="filter-toggle-label">
                <input type="checkbox" class="filter-toggle" name="periodType" value="${option.value}" 
                       ${activeTypes.includes(option.value) ? 'checked' : ''}>
                <span class="filter-toggle-slider"></span>
                <span class="filter-toggle-text">${option.label}</span>
            </label>
        `).join('');
    }

    private renderTermCheckboxes(): string {
        const termOptions = this.scheduleFilterService!.getFilterOptions('periodTerm', this.selectedCourses) || [];
        const activeTerms = this.getActiveTerms();

        if (termOptions.length === 0) {
            return '<div class="no-options">No academic terms available</div>';
        }

        return termOptions.map((option: any) => `
            <label class="filter-toggle-label">
                <input type="checkbox" class="filter-toggle" name="periodTerm" value="${option.value}" 
                       ${activeTerms.includes(option.value) ? 'checked' : ''}>
                <span class="filter-toggle-slider"></span>
                <span class="filter-toggle-text">${option.label}</span>
            </label>
        `).join('');
    }

    private getSearchValue(): string {
        const searchFilter = this.scheduleFilterService.getActiveFilters().find(f => f.id === 'searchText');
        return searchFilter?.criteria?.query || '';
    }


    private getActiveDays(): string[] {
        const filter = this.scheduleFilterService!.getActiveFilters().find(f => f.id === 'periodDays');
        return filter?.criteria?.days || [];
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
        
        // Remove filter buttons
        modalElement.querySelectorAll('.remove-filter-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const filterId = (e.target as HTMLElement).dataset.filterId;
                if (filterId) {
                    this.scheduleFilterService.removeFilter(filterId);
                    this.refreshActiveFilters();
                }
            });
        });

        // Clear all filters
        modalElement.querySelector('#clear-all-filters')?.addEventListener('click', () => {
            this.scheduleFilterService!.clearFilters();
            this.refreshActiveFilters();
            this.resetFilterInputs();
        });

        // Apply filters button
        modalElement.querySelector('#apply-filters')?.addEventListener('click', () => {
            this.applyFilters();
            this.hide();
        });

        // Real-time search input
        const searchInput = modalElement.querySelector('#modal-search-input') as HTMLInputElement;
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.trim();
                if (query) {
                    this.scheduleFilterService!.addFilter('searchText', { query });
                } else {
                    this.scheduleFilterService!.removeFilter('searchText');
                }
                this.refreshActiveFilters();
            });
        }


        // Course selection is now handled by ProfileStateManager directly
        // No event listeners needed for course selection checkboxes

        // Days checkboxes
        modalElement.querySelectorAll('input[name="periodDays"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateDaysFilter();
                this.refreshActiveFilters();
            });
        });


        // Period type checkboxes
        modalElement.querySelectorAll('input[name="periodType"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updatePeriodTypeFilter();
                this.refreshActiveFilters();
            });
        });

        // Term checkboxes
        modalElement.querySelectorAll('input[name="periodTerm"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateTermFilter();
                this.refreshActiveFilters();
            });
        });

        // Availability filters
        const availableOnlyCheckbox = modalElement.querySelector('#available-only-filter') as HTMLInputElement;
        const minSeatsInput = modalElement.querySelector('#min-seats-filter') as HTMLInputElement;

        if (availableOnlyCheckbox) {
            availableOnlyCheckbox.addEventListener('change', () => {
                this.updateAvailabilityFilter();
                this.refreshActiveFilters();
            });
        }

        if (minSeatsInput) {
            minSeatsInput.addEventListener('input', () => {
                this.updateAvailabilityFilter();
                this.refreshActiveFilters();
            });
        }

        // Conflict detection filter
        const avoidConflictsCheckbox = modalElement.querySelector('#avoid-conflicts-filter') as HTMLInputElement;
        if (avoidConflictsCheckbox) {
            avoidConflictsCheckbox.addEventListener('change', () => {
                this.updateConflictFilter();
                this.refreshActiveFilters();
            });
        }

        // Setup professor filter
        this.setupProfessorFilter(modalElement);
    }



    private updateDaysFilter(): void {
        if (!this.currentModalId) return;
        
        const modalElement = document.getElementById(this.currentModalId);
        if (modalElement) {
            const checkedDays = Array.from(modalElement.querySelectorAll('input[name="periodDays"]:checked'))
                .map(cb => (cb as HTMLInputElement).value);

            if (checkedDays.length > 0) {
                this.scheduleFilterService!.addFilter('periodDays', { days: checkedDays });
            } else {
                this.scheduleFilterService!.removeFilter('periodDays');
            }
        }
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

    private applyFilters(): void {
        // Save filter state
        this.scheduleFilterService.saveFiltersToStorage();
    }

    private refreshActiveFilters(): void {
        if (!this.currentModalId) return;
        
        const modalElement = document.getElementById(this.currentModalId);
        if (modalElement) {
            const activeFiltersList = modalElement.querySelector('#active-filters-list');
            if (activeFiltersList) {
                const activeFilters = this.scheduleFilterService!.getActiveFilters();
                activeFiltersList.innerHTML = this.renderActiveFilters(activeFilters);
                
                // Re-bind remove button event listeners
                activeFiltersList.querySelectorAll('.remove-filter-btn').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const filterId = (e.target as HTMLElement).dataset.filterId;
                        if (filterId) {
                            this.scheduleFilterService!.removeFilter(filterId);
                            this.refreshActiveFilters();
                        }
                    });
                });
            }
        }
    }

    private resetFilterInputs(): void {
        if (!this.currentModalId) return;
        
        const modalElement = document.getElementById(this.currentModalId);
        if (modalElement) {
            // Clear search input
            const searchInput = modalElement.querySelector('#modal-search-input') as HTMLInputElement;
            if (searchInput) {
                searchInput.value = '';
            }

            // Reset selects
            const sectionStatusSelect = modalElement.querySelector('#section-status-filter') as HTMLSelectElement;
            if (sectionStatusSelect) {
                sectionStatusSelect.value = '';
            }

            const requiredStatusSelect = modalElement.querySelector('#required-status-filter') as HTMLSelectElement;
            if (requiredStatusSelect) {
                requiredStatusSelect.value = '';
            }

            // Uncheck all checkboxes
            modalElement.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                (cb as HTMLInputElement).checked = false;
            });
        }
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
                        `<div class="professor-option" data-professor="${prof}">${prof}</div>`
                    ).join('');
                    dropdown.style.display = matches.length > 0 ? 'block' : 'none';
                } else {
                    dropdown.style.display = 'none';
                }
            });

            dropdown.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains('professor-option')) {
                    const professor = target.dataset.professor;
                    if (professor) {
                        this.addProfessorToSelection(professor);
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

        modalElement.querySelectorAll('.chip-remove').forEach(button => {
            button.addEventListener('click', (e) => {
                const professor = (e.target as HTMLElement).dataset.professor;
                if (professor) {
                    this.removeProfessorFromSelection(professor);
                }
            });
        });
    }

    private addProfessorToSelection(professor: string): void {
        const activeProfessors = this.getActiveProfessors();
        if (!activeProfessors.includes(professor)) {
            activeProfessors.push(professor);
            this.scheduleFilterService!.addFilter('periodProfessor', { professors: activeProfessors });
            this.refreshActiveFilters();
            this.refreshProfessorChips();
        }
    }

    private removeProfessorFromSelection(professor: string): void {
        const activeProfessors = this.getActiveProfessors();
        const updatedProfessors = activeProfessors.filter(prof => prof !== professor);
        
        if (updatedProfessors.length > 0) {
            this.scheduleFilterService!.addFilter('periodProfessor', { professors: updatedProfessors });
        } else {
            this.scheduleFilterService!.removeFilter('periodProfessor');
        }
        this.refreshActiveFilters();
        this.refreshProfessorChips();
    }

    private refreshProfessorChips(): void {
        if (!this.currentModalId) return;
        
        const modalElement = document.getElementById(this.currentModalId);
        if (modalElement) {
            const chipsContainer = modalElement.querySelector('.filter-selected-chips');
            if (chipsContainer) {
                const activeProfessors = this.getActiveProfessors();
                const selectedProfessorsChips = activeProfessors.map(prof => `
                    <div class="filter-chip" data-professor="${prof}">
                        <span>${prof}</span>
                        <button type="button" class="chip-remove" data-professor="${prof}">×</button>
                    </div>
                `).join('');
                chipsContainer.innerHTML = selectedProfessorsChips;

                // Re-bind chip remove event listeners
                chipsContainer.querySelectorAll('.chip-remove').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const professor = (e.target as HTMLElement).dataset.professor;
                        if (professor) {
                            this.removeProfessorFromSelection(professor);
                        }
                    });
                });
            }
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