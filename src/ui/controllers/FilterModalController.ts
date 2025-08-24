import { ModalService } from '../../services/ModalService';
import { FilterService } from '../../services/FilterService';
import { Course, Department } from '../../types/types';
import { getDepartmentCategory, CATEGORY_ORDER } from '../../utils/departmentUtils';

export class FilterModalController {
    private modalService: ModalService;
    private filterService: FilterService | null = null;
    private allCourses: Course[] = [];
    private allDepartments: Department[] = [];
    private currentModalId: string | null = null;
    private isCategoryMode: boolean = false;
    private isUpdatingFilter: boolean = false;

    constructor(modalService: ModalService) {
        this.modalService = modalService;
    }

    setFilterService(filterService: FilterService): void {
        this.filterService = filterService;
    }

    setCourseData(departments: Department[]): void {
        this.allDepartments = departments;
        this.allCourses = [];
        departments.forEach(dept => {
            this.allCourses.push(...dept.courses);
        });
    }

    // Method to sync search input from main controller
    syncSearchInputFromMain(query: string): void {
        if (this.currentModalId) {
            const modalElement = document.getElementById(this.currentModalId);
            if (modalElement) {
                const searchInput = modalElement.querySelector('.search-text-input') as HTMLInputElement;
                if (searchInput && searchInput.value !== query) {
                    searchInput.value = query;
                    this.updateClearSearchButton(modalElement, query);
                }
            }
        }
    }

    // Method to refresh department selection from external changes
    refreshDepartmentSelection(): void {
        if (this.isUpdatingFilter) {
            return;
        }
        
        if (this.currentModalId) {
            const modalElement = document.getElementById(this.currentModalId);
            if (modalElement) {
                this.updateDepartmentCheckboxes(modalElement);
            }
        }
    }

    private updateDepartmentCheckboxes(modalElement: HTMLElement): void {
        if (!this.filterService) return;
        
        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'department');
        const activeDepartments = activeFilter?.criteria?.departments || [];
        
        // Update all department checkboxes
        const checkboxes = modalElement.querySelectorAll('input[data-filter="department"]') as NodeListOf<HTMLInputElement>;
        checkboxes.forEach(checkbox => {
            if (this.isCategoryMode && checkbox.dataset.category === 'true') {
                // For category checkboxes, check if ANY department in that category is selected
                const categoryName = checkbox.value;
                const allAvailableDepartments = this.filterService!.getFilterOptions('department', this.allCourses) as string[];
                const categoryDepartments = allAvailableDepartments.filter(dept => 
                    getDepartmentCategory(dept) === categoryName
                );
                
                const selectedInCategory = categoryDepartments.filter(dept => 
                    activeDepartments.includes(dept)
                );
                
                checkbox.checked = selectedInCategory.length > 0;
                
                // Handle indeterminate state
                const allSelected = selectedInCategory.length === categoryDepartments.length;
                const someSelected = selectedInCategory.length > 0;
                checkbox.indeterminate = someSelected && !allSelected;
                
            } else {
                // For individual department checkboxes
                checkbox.checked = activeDepartments.includes(checkbox.value);
            }
        });
        
        // Update preview
        this.updatePreview(modalElement);
    }

    show(): string {
        if (!this.filterService) {
            console.error('FilterService not set on FilterModalController');
            return '';
        }

        const id = this.modalService.generateId();
        this.currentModalId = id;
        const modalElement = this.createModalElement(id);
        
        this.modalService.showModal(id, modalElement);
        this.modalService.setupModalBehavior(modalElement, id, { closeOnBackdrop: true, closeOnEscape: true });

        // Set up filter UI after modal is shown
        setTimeout(() => this.initializeFilterUI(modalElement), 50);

        return id;
    }

    private createModalElement(id: string): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop filter-modal';
        backdrop.id = id;

        const activeFiltersCount = this.filterService?.getFilterCount() || 0;
        const courseCount = this.filterService ? this.filterService.filterCourses(this.allCourses).length : this.allCourses.length;

        backdrop.innerHTML = `
            <div class="modal-dialog filter-modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            Filter Courses 
                            <span id="filter-count" class="filter-count">${activeFiltersCount > 0 ? `(${activeFiltersCount})` : ''}</span>
                        </h3>
                        <button class="modal-close" onclick="document.getElementById('${id}').click()">×</button>
                    </div>
                    <div class="modal-body filter-modal-body">
                        ${this.createFilterSections()}
                    </div>
                    <div class="modal-footer">
                        <div class="filter-preview">
                            <span id="course-count-preview">${courseCount} courses match current filters</span>
                        </div>
                        <div class="filter-actions">
                            <button class="modal-btn btn-secondary" id="clear-all-filters">Clear All</button>
                            <button class="modal-btn btn-primary" onclick="document.getElementById('${id}').click()">Apply</button>
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

    private createFilterSections(): string {
        return `
            <div class="filter-sections">
                ${this.createSearchTextFilter()}
                ${this.createDepartmentFilter()}
                ${this.createAvailabilityFilter()}
                ${this.createCreditRangeFilter()}
                ${this.createProfessorFilter()}
                ${this.createTermFilter()}
                ${this.createLocationFilter()}
            </div>
        `;
    }

    private createSearchTextFilter(): string {
        if (!this.filterService) return '';
        
        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'searchText');
        const currentQuery = activeFilter?.criteria?.query || '';

        return `
            <div class="filter-section search-text-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Search Text</h4>
                    <button class="filter-clear-search" ${currentQuery ? '' : 'style="display: none;"'}>Clear</button>
                </div>
                <div class="filter-section-content">
                    <div class="filter-search-container">
                        <input type="text" class="filter-search search-text-input" 
                               placeholder="Search courses..." 
                               value="${this.escapeHtml(currentQuery)}"
                               data-filter="searchText">
                    </div>
                </div>
            </div>
        `;
    }

    private createDepartmentFilter(): string {
        if (!this.filterService) return '';
        
        const checkboxesHtml = this.isCategoryMode ? 
            this.createCategoryCheckboxes() : 
            this.createIndividualDepartmentCheckboxes();
        
        const searchPlaceholder = this.isCategoryMode ? 
            'Search categories...' : 
            'Search departments...';

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Departments</h4>
                    <div class="filter-section-actions">
                        <button class="filter-select-all" data-filter="department">All</button>
                        <button class="filter-select-none" data-filter="department">None</button>
                    </div>
                </div>
                <div class="filter-section-content">
                    <div class="filter-toggle-container">
                        <label class="filter-toggle-label">
                            <input type="checkbox" class="filter-toggle" ${this.isCategoryMode ? 'checked' : ''} 
                                   id="category-mode-toggle">
                            <span class="filter-toggle-slider"></span>
                            <span class="filter-toggle-text">Search by Credit Requirements</span>
                        </label>
                    </div>
                    <div class="filter-search-container">
                        <input type="text" class="filter-search" placeholder="${searchPlaceholder}" data-filter="department">
                    </div>
                    <div class="filter-checkbox-grid" id="department-checkboxes">
                        ${checkboxesHtml}
                    </div>
                </div>
            </div>
        `;
    }

    private createIndividualDepartmentCheckboxes(): string {
        if (!this.filterService) return '';
        
        const departments = this.filterService.getFilterOptions('department', this.allCourses) as string[];
        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'department');
        const activeDepartments = activeFilter?.criteria?.departments || [];

        return departments.map(dept => `
            <label class="filter-checkbox-label">
                <input type="checkbox" value="${dept}" ${activeDepartments.includes(dept) ? 'checked' : ''} 
                       data-filter="department">
                <span class="filter-checkbox-text">${dept}</span>
            </label>
        `).join('');
    }

    private createAvailabilityFilter(): string {
        if (!this.filterService) return '';
        
        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'availability');
        const isChecked = activeFilter?.criteria?.availableOnly || false;

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Availability</h4>
                </div>
                <div class="filter-section-content">
                    <label class="filter-toggle-label">
                        <input type="checkbox" class="filter-toggle" data-filter="availability" ${isChecked ? 'checked' : ''}>
                        <span class="filter-toggle-slider"></span>
                        <span class="filter-toggle-text">Show only courses with available seats</span>
                    </label>
                </div>
            </div>
        `;
    }

    private createCreditRangeFilter(): string {
        if (!this.filterService) return '';
        
        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'creditRange');
        const minCredits = activeFilter?.criteria?.min || 1;
        const maxCredits = activeFilter?.criteria?.max || 4;

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Credit Hours</h4>
                </div>
                <div class="filter-section-content">
                    <div class="filter-range-container">
                        <div class="filter-range-inputs">
                            <div class="filter-range-input">
                                <label>Min Credits</label>
                                <input type="number" min="1" max="4" value="${minCredits}" 
                                       id="credit-min" data-filter="creditRange">
                            </div>
                            <div class="filter-range-input">
                                <label>Max Credits</label>
                                <input type="number" min="1" max="4" value="${maxCredits}" 
                                       id="credit-max" data-filter="creditRange">
                            </div>
                        </div>
                        <div class="filter-quick-select">
                            <button class="filter-quick-btn" data-credits="1">1</button>
                            <button class="filter-quick-btn" data-credits="2">2</button>
                            <button class="filter-quick-btn" data-credits="3">3</button>
                            <button class="filter-quick-btn" data-credits="4">4</button>
                            <button class="filter-quick-btn" data-credits="3-4">3-4</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private createProfessorFilter(): string {
        if (!this.filterService) return '';
        
        const professors = this.filterService.getFilterOptions('professor', this.allCourses) as string[];
        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'professor');
        const activeProfessors = activeFilter?.criteria?.professors || [];

        const selectedProfessorsChips = activeProfessors.map((prof: any) => `
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

    private createTermFilter(): string {
        if (!this.filterService) return '';
        
        const terms = this.filterService.getFilterOptions('term', this.allCourses) as string[];
        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'term');
        const activeTerms = activeFilter?.criteria?.terms || [];

        const termCheckboxes = terms.map(term => `
            <label class="filter-checkbox-label term-checkbox">
                <input type="checkbox" value="${term}" ${activeTerms.includes(term) ? 'checked' : ''} 
                       data-filter="term">
                <span class="filter-checkbox-text">${term} Term</span>
            </label>
        `).join('');

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Terms</h4>
                    <button class="filter-select-all" data-filter="term">All Terms</button>
                </div>
                <div class="filter-section-content">
                    <div class="filter-checkbox-row">
                        ${termCheckboxes}
                    </div>
                </div>
            </div>
        `;
    }

    private createLocationFilter(): string {
        if (!this.filterService) return '';
        
        const locationOptions = this.filterService.getFilterOptions('location', this.allCourses) as { buildings: string[] };
        const buildings = locationOptions.buildings || [];
        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'location');
        const activeBuildings = activeFilter?.criteria?.buildings || [];

        const buildingCheckboxes = buildings.map(building => `
            <label class="filter-checkbox-label">
                <input type="checkbox" value="${building}" ${activeBuildings.includes(building) ? 'checked' : ''} 
                       data-filter="location">
                <span class="filter-checkbox-text">${building}</span>
            </label>
        `).join('');

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Buildings</h4>
                    <div class="filter-section-actions">
                        <button class="filter-select-all" data-filter="location">All</button>
                        <button class="filter-select-none" data-filter="location">None</button>
                    </div>
                </div>
                <div class="filter-section-content">
                    <div class="filter-search-container">
                        <input type="text" class="filter-search" placeholder="Search buildings..." data-filter="location">
                    </div>
                    <div class="filter-checkbox-grid" id="location-checkboxes">
                        ${buildingCheckboxes}
                    </div>
                </div>
            </div>
        `;
    }

    private initializeFilterUI(modalElement: HTMLElement): void {
        if (!this.filterService) return;

        this.setupSearchTextFilter(modalElement);
        this.setupDepartmentFilter(modalElement);
        this.setupAvailabilityFilter(modalElement);
        this.setupCreditRangeFilter(modalElement);
        this.setupProfessorFilter(modalElement);
        this.setupTermFilter(modalElement);
        this.setupLocationFilter(modalElement);
        this.setupClearAllButton(modalElement);
        this.setupFilterSearch(modalElement);
    }

    private setupSearchTextFilter(modalElement: HTMLElement): void {
        const searchInput = modalElement.querySelector('.search-text-input') as HTMLInputElement;
        const clearButton = modalElement.querySelector('.filter-clear-search');
        
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.trim();
                this.updateSearchTextFilter(query, modalElement);
                this.syncMainSearchInput(query);
            });
        }

        if (clearButton) {
            clearButton.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                }
                this.updateSearchTextFilter('', modalElement);
                this.syncMainSearchInput('');
            });
        }
    }

    private setupDepartmentFilter(modalElement: HTMLElement): void {
        // Setup toggle for category mode
        const categoryToggle = modalElement.querySelector('#category-mode-toggle') as HTMLInputElement;
        if (categoryToggle) {
            categoryToggle.addEventListener('change', () => {
                this.toggleDepartmentMode(modalElement);
            });
        }

        const checkboxes = modalElement.querySelectorAll('input[data-filter="department"]');
        
        // Set up indeterminate states for category mode checkboxes
        if (this.isCategoryMode) {
            checkboxes.forEach((checkbox) => {
                const cb = checkbox as HTMLInputElement;
                if (cb.dataset.indeterminate === 'true') {
                    cb.indeterminate = true;
                }
            });
        }
        
        checkboxes.forEach((checkbox) => {
            checkbox.addEventListener('change', () => {
                this.updateDepartmentFilter(modalElement);
            });
        });

        const selectAll = modalElement.querySelector('.filter-select-all[data-filter="department"]');
        const selectNone = modalElement.querySelector('.filter-select-none[data-filter="department"]');

        selectAll?.addEventListener('click', () => {
            checkboxes.forEach((cb: any) => cb.checked = true);
            this.updateDepartmentFilter(modalElement);
        });

        selectNone?.addEventListener('click', () => {
            checkboxes.forEach((cb: any) => cb.checked = false);
            this.updateDepartmentFilter(modalElement);
        });
    }

    private setupAvailabilityFilter(modalElement: HTMLElement): void {
        const toggle = modalElement.querySelector('input[data-filter="availability"]') as HTMLInputElement;
        toggle?.addEventListener('change', () => this.updateAvailabilityFilter(modalElement));
    }

    private setupCreditRangeFilter(modalElement: HTMLElement): void {
        const minInput = modalElement.querySelector('#credit-min') as HTMLInputElement;
        const maxInput = modalElement.querySelector('#credit-max') as HTMLInputElement;
        const quickBtns = modalElement.querySelectorAll('.filter-quick-btn');

        minInput?.addEventListener('change', () => this.updateCreditRangeFilter(modalElement));
        maxInput?.addEventListener('change', () => this.updateCreditRangeFilter(modalElement));

        quickBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const credits = (e.target as HTMLElement).dataset.credits;
                if (credits?.includes('-')) {
                    const [min, max] = credits.split('-');
                    if (minInput) minInput.value = min;
                    if (maxInput) maxInput.value = max;
                } else {
                    if (minInput) minInput.value = credits!;
                    if (maxInput) maxInput.value = credits!;
                }
                this.updateCreditRangeFilter(modalElement);
            });
        });
    }

    private setupProfessorFilter(modalElement: HTMLElement): void {
        const searchInput = modalElement.querySelector('.professor-search') as HTMLInputElement;
        const dropdown = modalElement.querySelector('#professor-dropdown') as HTMLElement;
        
        if (searchInput && this.filterService) {
            const professors = this.filterService.getFilterOptions('professor', this.allCourses) as string[];
            
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.toLowerCase();
                if (query.length > 0) {
                    const matches = professors.filter(prof => 
                        prof.toLowerCase().includes(query) && prof !== 'TBA'
                    ).slice(0, 10);
                    
                    dropdown.innerHTML = matches.map(prof => 
                        `<div class="professor-option" data-professor="${prof}">${prof}</div>`
                    ).join('');
                    dropdown.style.display = matches.length > 0 ? 'block' : 'none';
                } else {
                    dropdown.style.display = 'none';
                }
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!searchInput.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
                    dropdown.style.display = 'none';
                }
            });

            dropdown.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains('professor-option')) {
                    const professor = target.dataset.professor!;
                    this.addProfessorFilter(professor, modalElement);
                    searchInput.value = '';
                    dropdown.style.display = 'none';
                }
            });
        }

        // Handle chip removal - use more specific delegation
        const chipsContainer = modalElement.querySelector('.filter-selected-chips');
        if (chipsContainer) {
            chipsContainer.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains('filter-chip-remove')) {
                    e.stopPropagation();
                    e.preventDefault();
                    const professor = this.unescapeHtml(target.dataset.professor!);
                    this.removeProfessorFilter(professor, modalElement);
                }
            });
        }
    }

    private setupTermFilter(modalElement: HTMLElement): void {
        const checkboxes = modalElement.querySelectorAll('input[data-filter="term"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateTermFilter(modalElement));
        });

        const selectAll = modalElement.querySelector('.filter-select-all[data-filter="term"]');
        selectAll?.addEventListener('click', () => {
            checkboxes.forEach((cb: any) => cb.checked = true);
            this.updateTermFilter(modalElement);
        });
    }

    private setupLocationFilter(modalElement: HTMLElement): void {
        const checkboxes = modalElement.querySelectorAll('input[data-filter="location"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateLocationFilter(modalElement));
        });

        const selectAll = modalElement.querySelector('.filter-select-all[data-filter="location"]');
        const selectNone = modalElement.querySelector('.filter-select-none[data-filter="location"]');

        selectAll?.addEventListener('click', () => {
            checkboxes.forEach((cb: any) => cb.checked = true);
            this.updateLocationFilter(modalElement);
        });

        selectNone?.addEventListener('click', () => {
            checkboxes.forEach((cb: any) => cb.checked = false);
            this.updateLocationFilter(modalElement);
        });
    }

    private setupClearAllButton(modalElement: HTMLElement): void {
        const clearButton = modalElement.querySelector('#clear-all-filters');
        clearButton?.addEventListener('click', () => {
            if (this.filterService) {
                this.filterService.clearFilters();
                this.updatePreview(modalElement);
                // Sync main search input to clear it
                this.syncMainSearchInput('');
                // Refresh the modal content
                const modalBody = modalElement.querySelector('.filter-modal-body');
                if (modalBody) {
                    modalBody.innerHTML = this.createFilterSections();
                    this.initializeFilterUI(modalElement);
                }
            }
        });
    }

    private setupFilterSearch(modalElement: HTMLElement): void {
        const searchInputs = modalElement.querySelectorAll('.filter-search');
        searchInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const searchInput = e.target as HTMLInputElement;
                const filterType = searchInput.dataset.filter;
                const query = searchInput.value.toLowerCase();
                
                if (filterType === 'department') {
                    const checkboxes = modalElement.querySelector('#department-checkboxes');
                    if (checkboxes) {
                        const labels = checkboxes.querySelectorAll('.filter-checkbox-label');
                        labels.forEach((label: any) => {
                            const checkbox = label.querySelector('input[type="checkbox"]') as HTMLInputElement;
                            const value = checkbox ? checkbox.value : '';
                            let matches = false;
                            
                            if (this.isCategoryMode) {
                                // In category mode, search category names directly
                                matches = value.toLowerCase().includes(query);
                            } else {
                                // In individual mode, use the enhanced search (dept + category)
                                matches = this.departmentMatchesSearch(value, query);
                            }
                            
                            label.style.display = matches ? 'flex' : 'none';
                        });
                    }
                }
            });
        });
    }

    // Filter update methods
    private updateSearchTextFilter(query: string, modalElement: HTMLElement): void {
        if (query.length > 0) {
            this.filterService?.addFilter('searchText', { query });
        } else {
            this.filterService?.removeFilter('searchText');
        }
        this.updatePreview(modalElement);
        this.updateClearSearchButton(modalElement, query);
    }

    private syncMainSearchInput(query: string): void {
        const mainSearchInput = document.getElementById('search-input') as HTMLInputElement;
        if (mainSearchInput) {
            mainSearchInput.value = query;
        }
    }

    private updateClearSearchButton(modalElement: HTMLElement, query: string): void {
        const clearButton = modalElement.querySelector('.filter-clear-search') as HTMLElement;
        if (clearButton) {
            clearButton.style.display = query.length > 0 ? 'inline-block' : 'none';
        }
    }

    private departmentMatchesSearch(departmentAbbreviation: string, query: string): boolean {
        if (!query) return true;
        
        const lowerQuery = query.toLowerCase();
        const lowerDept = departmentAbbreviation.toLowerCase();
        
        // Check if query matches the department abbreviation
        if (lowerDept.includes(lowerQuery)) {
            return true;
        }
        
        // Check if query matches the department category
        const category = getDepartmentCategory(departmentAbbreviation);
        const lowerCategory = category.toLowerCase();
        if (lowerCategory.includes(lowerQuery)) {
            return true;
        }
        
        return false;
    }

    private toggleDepartmentMode(modalElement: HTMLElement): void {
        this.isCategoryMode = !this.isCategoryMode;
        
        // Refresh the department filter section
        const allFilterSections = modalElement.querySelectorAll('.filter-section');
        let departmentSection: Element | null = null;
        
        allFilterSections.forEach((section) => {
            const titleElement = section.querySelector('.filter-section-title');
            if (titleElement?.textContent === 'Departments') {
                departmentSection = section;
            }
        });
        
        if (departmentSection) {
            const newDepartmentFilter = this.createDepartmentFilter();
            departmentSection.outerHTML = newDepartmentFilter;
            
            // Re-query the modal element to ensure we have fresh DOM references
            const freshModalElement = document.getElementById(this.currentModalId || '') as HTMLElement;
            if (freshModalElement) {
                this.setupDepartmentFilter(freshModalElement);
                this.setupFilterSearch(freshModalElement);
            }
        }
    }

    private createCategoryCheckboxes(): string {
        if (!this.filterService) return '';
        
        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'department');
        const activeDepartments = activeFilter?.criteria?.departments || [];
        
        // Get all available departments to determine which categories should be checked
        const allAvailableDepartments = this.filterService.getFilterOptions('department', this.allCourses) as string[];
        
        const categoriesToShow = CATEGORY_ORDER.filter(category => category !== 'Other');
        
        const categoryCheckboxes = categoriesToShow.map(category => {
            // Get all departments in this category
            const categoryDepartments = allAvailableDepartments.filter(dept => 
                getDepartmentCategory(dept) === category
            );
            
            // Calculate selection states
            const selectedDepartmentsInCategory = categoryDepartments.filter(dept => 
                activeDepartments.includes(dept)
            );
            
            const allSelected = categoryDepartments.length > 0 && 
                selectedDepartmentsInCategory.length === categoryDepartments.length;
            const someSelected = selectedDepartmentsInCategory.length > 0;
            const isIndeterminate = someSelected && !allSelected;
            
            const isChecked = allSelected || someSelected;
            
            return `
                <label class="filter-checkbox-label">
                    <input type="checkbox" value="${category}" ${isChecked ? 'checked' : ''} 
                           ${isIndeterminate ? 'data-indeterminate="true"' : ''}
                           data-filter="department" data-category="true">
                    <span class="filter-checkbox-text">${category}</span>
                </label>
            `;
        }).join('');

        return categoryCheckboxes;
    }

    private updateDepartmentFilter(modalElement: HTMLElement): void {
        if (this.isUpdatingFilter) {
            return;
        }
        
        this.isUpdatingFilter = true;
        
        try {
            const checkboxes = modalElement.querySelectorAll('input[data-filter="department"]:checked') as NodeListOf<HTMLInputElement>;
            let departments: string[] = [];
            
            if (this.isCategoryMode) {
                // Handle category selections - convert categories to individual departments
                const selectedCategories = Array.from(checkboxes).map(cb => cb.value);
                const allAvailableDepartments = this.filterService?.getFilterOptions('department', this.allCourses) as string[] || [];
                
                selectedCategories.forEach(category => {
                    const categoryDepartments = allAvailableDepartments.filter(dept => 
                        getDepartmentCategory(dept) === category
                    );
                    departments.push(...categoryDepartments);
                });
            } else {
                // Handle individual department selections
                departments = Array.from(checkboxes).map(cb => cb.value);
            }
            
            if (departments.length > 0) {
                this.filterService?.addFilter('department', { departments });
            } else {
                this.filterService?.removeFilter('department');
            }
            
            this.updatePreview(modalElement);
            
        } finally {
            // Small delay before releasing the lock to prevent immediate re-entry
            setTimeout(() => {
                this.isUpdatingFilter = false;
            }, 100);
        }
    }

    private updateAvailabilityFilter(modalElement: HTMLElement): void {
        const toggle = modalElement.querySelector('input[data-filter="availability"]') as HTMLInputElement;
        
        if (toggle.checked) {
            this.filterService?.addFilter('availability', { availableOnly: true });
        } else {
            this.filterService?.removeFilter('availability');
        }
        this.updatePreview(modalElement);
    }

    private updateCreditRangeFilter(modalElement: HTMLElement): void {
        const minInput = modalElement.querySelector('#credit-min') as HTMLInputElement;
        const maxInput = modalElement.querySelector('#credit-max') as HTMLInputElement;
        
        const min = parseInt(minInput.value);
        const max = parseInt(maxInput.value);
        
        if (min && max && (min !== 1 || max !== 4)) {
            this.filterService?.addFilter('creditRange', { min, max });
        } else {
            this.filterService?.removeFilter('creditRange');
        }
        this.updatePreview(modalElement);
    }

    private addProfessorFilter(professor: string, modalElement: HTMLElement): void {
        if (!this.filterService) return;
        
        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'professor');
        const currentProfessors = activeFilter?.criteria?.professors || [];
        
        if (!currentProfessors.includes(professor)) {
            const updatedProfessors = [...currentProfessors, professor];
            this.filterService.addFilter('professor', { professors: updatedProfessors });
            this.refreshProfessorChips(modalElement);
            this.updatePreview(modalElement);
        }
    }

    private removeProfessorFilter(professor: string, modalElement: HTMLElement): void {
        if (!this.filterService) return;
        
        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'professor');
        const currentProfessors = activeFilter?.criteria?.professors || [];
        const updatedProfessors = currentProfessors.filter((p: string) => p !== professor);
        
        if (updatedProfessors.length > 0) {
            this.filterService.addFilter('professor', { professors: updatedProfessors });
        } else {
            this.filterService.removeFilter('professor');
        }
        
        this.refreshProfessorChips(modalElement);
        this.updatePreview(modalElement);
    }

    private refreshProfessorChips(modalElement: HTMLElement): void {
        if (!this.filterService) return;
        
        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'professor');
        const professors = activeFilter?.criteria?.professors || [];
        
        const chipsContainer = modalElement.querySelector('.filter-selected-chips');
        if (chipsContainer) {
            chipsContainer.innerHTML = professors.map((prof: any) => `
                <span class="filter-chip">
                    ${this.escapeHtml(prof)}
                    <button class="filter-chip-remove" data-professor="${this.escapeHtml(prof)}">×</button>
                </span>
            `).join('');
        }
    }

    private updateTermFilter(modalElement: HTMLElement): void {
        const checkboxes = modalElement.querySelectorAll('input[data-filter="term"]:checked') as NodeListOf<HTMLInputElement>;
        const terms = Array.from(checkboxes).map(cb => cb.value);
        
        if (terms.length > 0) {
            this.filterService?.addFilter('term', { terms });
        } else {
            this.filterService?.removeFilter('term');
        }
        this.updatePreview(modalElement);
    }

    private updateLocationFilter(modalElement: HTMLElement): void {
        const checkboxes = modalElement.querySelectorAll('input[data-filter="location"]:checked') as NodeListOf<HTMLInputElement>;
        const buildings = Array.from(checkboxes).map(cb => cb.value);
        
        if (buildings.length > 0) {
            this.filterService?.addFilter('location', { buildings });
        } else {
            this.filterService?.removeFilter('location');
        }
        this.updatePreview(modalElement);
    }

    private updatePreview(modalElement: HTMLElement): void {
        if (!this.filterService) return;
        
        const filteredCourses = this.filterService.filterCourses(this.allCourses);
        const courseCount = filteredCourses.length;
        const filterCount = this.filterService.getFilterCount();
        
        const countElement = modalElement.querySelector('#course-count-preview');
        const filterCountElement = modalElement.querySelector('#filter-count');
        
        if (countElement) {
            countElement.textContent = `${courseCount} courses match current filters`;
        }
        
        if (filterCountElement) {
            filterCountElement.textContent = filterCount > 0 ? `(${filterCount})` : '';
        }
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
}