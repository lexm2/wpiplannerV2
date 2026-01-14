import { ModalService } from '../../services/ui/ModalService';
import { CourseFilterService } from '../../services/filtering/CourseFilterService';
import { CourseSelectionService } from '../../services/selection/CourseSelectionService';
import { Course, Department } from '../../types/types';
import { BaseModal } from '../components/BaseModal';
import { getDepartmentCategory, CATEGORY_ORDER } from '../../utils/departmentUtils';
import { SharedFilterComponents } from '../components/SharedFilterComponents';
import { SharedFilterSetup } from '../components/SharedFilterSetup';
import { DepartmentFilterCriteria, SearchTextFilterCriteria, AvailabilityFilterCriteria, CreditRangeFilterCriteria, ProfessorFilterCriteria, TermFilterCriteria, GraduateLevelFilterCriteria } from '../../types/filters';

export class FilterModalController extends BaseModal {
    private filterService: CourseFilterService | null = null;
    private courseSelectionService: CourseSelectionService | null = null;
    private allCourses: Course[] = [];
    private isCategoryMode: boolean = false;
    private isUpdatingFilter: boolean = false;

    constructor(modalService: ModalService) {
        super(modalService);
    }

    setFilterService(filterService: CourseFilterService): void {
        this.filterService = filterService;
    }

    setCourseSelectionService(courseSelectionService: CourseSelectionService): void {
        this.courseSelectionService = courseSelectionService;
    }

    setCourseData(departments: Department[]): void {
        this.allCourses = [];
        departments.forEach(dept => {
            this.allCourses.push(...dept.courses);
        });
    }

    // Method to sync search input from main controller
    syncSearchInputFromMain(query: string): void {
        if (this.modalId) {
            const modalElement = document.getElementById(this.modalId);
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

        if (this.modalId) {
            const modalElement = document.getElementById(this.modalId);
            if (modalElement) {
                this.updateDepartmentCheckboxes(modalElement);
            }
        }
    }

    private updateDepartmentCheckboxes(modalElement: HTMLElement): void {
        if (!this.filterService) return;

        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'department');
        const criteria = activeFilter?.criteria as DepartmentFilterCriteria | undefined;
        const activeDepartments = criteria?.departments || [];
        
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

        const modalElement = this.createModalElement();
        const id = this.showModal(modalElement, { closeOnBackdrop: true, closeOnEscape: true });

        // Set up filter UI after modal is shown
        setTimeout(() => this.initializeFilterUI(modalElement), 50);

        return id;
    }

    private createModalElement(): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop filter-modal';

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
                        <button class="modal-close" data-modal-close>×</button>
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
                            <button class="modal-btn btn-primary" data-modal-close>Apply</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const dialog = backdrop.querySelector('.modal-dialog');
        if (dialog instanceof HTMLElement) {
            dialog.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        }

        // Setup close button handlers
        backdrop.querySelectorAll('[data-modal-close]').forEach(btn => {
            btn.addEventListener('click', () => this.hide());
        });

        return backdrop;
    }

    private createFilterSections(): string {
        return `
            <div class="filter-sections">
                ${this.createGraduateLevelFilter()}
                ${this.createSearchTextFilter()}
                ${this.createBookmarkFilter()}
                ${this.createAvailabilityFilter()}
                ${this.createDepartmentFilter()}
                ${this.createCreditRangeFilter()}
                ${this.createRMPRatingFilter()}
            </div>
        `;
    }

    private createGraduateLevelFilter(): string {
        if (!this.filterService) return '';

        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'graduateLevel');
        const criteria = activeFilter?.criteria as GraduateLevelFilterCriteria | undefined;
        const currentLevel = criteria?.level || 'all';

        // Get term filter state
        const terms = this.filterService.getFilterOptions('term', this.allCourses) as string[];
        const termFilter = this.filterService.getActiveFilters().find(f => f.id === 'term');
        const termCriteria = termFilter?.criteria as TermFilterCriteria | undefined;
        const activeTerms = termCriteria?.terms || [];

        const termCheckboxes = terms.map(term => `
            <label class="filter-term-label">
                <input type="checkbox" class="filter-toggle"
                       value="${term}"
                       data-filter="term"
                       ${activeTerms.includes(term) ? 'checked' : ''}>
                <span class="filter-term-text">${term}</span>
            </label>
        `).join('');

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Course Level</h4>
                </div>
                <div class="filter-section-content">
                    <div class="filter-segmented-control" id="graduate-level-filter">
                        <button class="segmented-btn ${currentLevel === 'all' ? 'active' : ''}" data-level="all">All</button>
                        <button class="segmented-btn ${currentLevel === 'undergraduate' ? 'active' : ''}" data-level="undergraduate">Undergrad</button>
                        <button class="segmented-btn ${currentLevel === 'graduate' ? 'active' : ''}" data-level="graduate">Graduate</button>
                    </div>
                    <div class="filter-term-row">
                        ${termCheckboxes}
                    </div>
                </div>
            </div>
        `;
    }

    private createSearchTextFilter(): string {
        if (!this.filterService) return '';

        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'searchText');
        const criteria = activeFilter?.criteria as SearchTextFilterCriteria | undefined;
        const currentQuery = criteria?.query || '';

        // Get active professors for chips
        const profFilter = this.filterService.getActiveFilters().find(f => f.id === 'professor');
        const profCriteria = profFilter?.criteria as ProfessorFilterCriteria | undefined;
        const activeProfessors = profCriteria?.professors || [];

        const professorChips = activeProfessors.map((prof: string) => `
            <span class="filter-chip">
                ${this.escapeHtml(prof)}
                <button class="filter-chip-remove" data-professor="${this.escapeHtml(prof)}" data-filter="professor">×</button>
            </span>
        `).join('');

        return `
            <div class="filter-section search-text-section">
                <div class="filter-section-content">
                    <div class="filter-search-container">
                        <input type="text" class="filter-search search-text-input"
                               placeholder="Search courses..."
                               value="${this.escapeHtml(currentQuery)}"
                               data-filter="searchText">
                    </div>
                    <div class="filter-search-container">
                        <input type="text" class="filter-search professor-search"
                               placeholder="Search professors..." data-filter="professor">
                        <div class="professor-dropdown" id="professor-dropdown" style="display: none;"></div>
                    </div>
                    <div class="filter-selected-chips" id="professor-chips" ${activeProfessors.length === 0 ? 'style="display: none;"' : ''}>
                        ${professorChips}
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
                    <label class="filter-toggle-label">
                        <input type="checkbox" class="filter-toggle" ${this.isCategoryMode ? 'checked' : ''} 
                               id="category-mode-toggle">
                        <span class="filter-toggle-slider"></span>
                        <span class="filter-toggle-text">Search by Credit Requirements</span>
                    </label>
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
        const criteria = activeFilter?.criteria as DepartmentFilterCriteria | undefined;
        const activeDepartments = criteria?.departments || [];

        return departments.map(dept => `
            <label class="department-checkbox-label">
                <input type="checkbox" class="department-checkbox" value="${dept}" ${activeDepartments.includes(dept) ? 'checked' : ''} 
                       data-filter="department">
                <span class="department-checkbox-text">${dept}</span>
            </label>
        `).join('');
    }

    private createAvailabilityFilter(): string {
        if (!this.filterService) return '';

        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'availability');
        const criteria = activeFilter?.criteria as AvailabilityFilterCriteria | undefined;
        const availableOnly = criteria?.availableOnly || false;
        const minAvailable = criteria?.minAvailable;

        // Get conflict filter state
        const conflictFilter = this.filterService.getActiveFilters().find(f => f.id === 'periodConflict');
        const conflictCriteria = conflictFilter?.criteria as { avoidConflicts?: boolean } | undefined;
        const avoidConflicts = conflictCriteria?.avoidConflicts || false;

        return SharedFilterComponents.createAvailabilityFilter({
            idPrefix: '',
            filterId: 'availability',
            availableOnly,
            minAvailable,
            avoidConflicts
        });
    }

    private createBookmarkFilter(): string {
        if (!this.filterService) return '';

        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'bookmark');
        const criteria = activeFilter?.criteria as { showBookmarkedOnly?: boolean } | undefined;
        const showBookmarkedOnly = criteria?.showBookmarkedOnly || false;

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Bookmarks</h4>
                </div>
                <div class="filter-section-content">
                    <label class="filter-toggle-label">
                        <input type="checkbox" class="filter-toggle" id="bookmarked-only-filter"
                               ${showBookmarkedOnly ? 'checked' : ''}>
                        <span class="filter-toggle-slider"></span>
                        <span class="filter-toggle-text">Show only bookmarked courses</span>
                    </label>
                </div>
            </div>
        `;
    }

    private createCreditRangeFilter(): string {
        if (!this.filterService) return '';

        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'creditRange');
        const criteria = activeFilter?.criteria as CreditRangeFilterCriteria | undefined;
        const minCredits = criteria?.min || 1;
        const maxCredits = criteria?.max || 3;

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
                                <input type="number" min="1" max="3" value="${maxCredits}" 
                                       id="credit-max" data-filter="creditRange">
                            </div>
                        </div>
                        <div class="filter-quick-select">
                            <button class="filter-quick-btn" data-credits="1">1</button>
                            <button class="filter-quick-btn" data-credits="2">2</button>
                            <button class="filter-quick-btn" data-credits="3">3</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private createRMPRatingFilter(): string {
        if (!this.filterService) return '';

        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'rmpRating');

        return SharedFilterComponents.createRMPRatingFilter({
            idPrefix: '',
            filterId: 'rmpRating',
            activeFilter
        });
    }

    private initializeFilterUI(modalElement: HTMLElement): void {
        if (!this.filterService) return;

        this.setupSearchTextFilter(modalElement);
        this.setupProfessorFilter(modalElement);
        this.setupRMPRatingFilter(modalElement);
        this.setupDepartmentFilter(modalElement);
        this.setupAvailabilityFilter(modalElement);
        this.setupConflictFilter(modalElement);
        this.setupBookmarkFilter(modalElement);
        this.setupCreditRangeFilter(modalElement);
        this.setupTermFilter(modalElement);
        this.setupGraduateLevelFilter(modalElement);
        this.setupClearAllButton(modalElement);
        this.setupFilterSearch(modalElement);
    }

    private setupGraduateLevelFilter(modalElement: HTMLElement): void {
        const graduateLevelControl = modalElement.querySelector('#graduate-level-filter');
        if (graduateLevelControl) {
            graduateLevelControl.querySelectorAll('.segmented-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const target = e.target as HTMLElement;
                    const level = target.dataset.level as 'all' | 'undergraduate' | 'graduate';

                    // Update active state
                    graduateLevelControl.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
                    target.classList.add('active');

                    this.updateGraduateLevelFilter(level, modalElement);
                });
            });
        }
    }

    private updateGraduateLevelFilter(level: 'all' | 'undergraduate' | 'graduate', modalElement: HTMLElement): void {
        if (level === 'all') {
            this.filterService?.removeFilter('graduateLevel');
        } else {
            this.filterService?.addFilter('graduateLevel', { level });
        }
        this.updatePreview(modalElement);
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
        SharedFilterSetup.setupAvailabilityFilter({
            modalElement,
            idPrefix: '',
            updateFilter: () => this.updateAvailabilityFilter(modalElement)
        });
    }

    private setupConflictFilter(modalElement: HTMLElement): void {
        SharedFilterSetup.setupConflictFilter({
            modalElement,
            idPrefix: '',
            updateFilter: () => this.updateConflictFilter(modalElement)
        });
    }

    private setupBookmarkFilter(modalElement: HTMLElement): void {
        const checkbox = modalElement.querySelector('#bookmarked-only-filter') as HTMLInputElement;
        if (checkbox) {
            checkbox.addEventListener('change', () => this.updateBookmarkFilter(modalElement));
        }
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
        if (!this.filterService) return;

        const professors = this.filterService.getFilterOptions('professor', this.allCourses) as string[];

        SharedFilterSetup.setupProfessorFilter({
            modalElement,
            filterService: this.filterService as any,
            idPrefix: '',
            filterId: 'professor',
            professors,
            updateFilter: (updatedProfessors: string[]) => {
                if (updatedProfessors.length > 0) {
                    this.filterService?.addFilter('professor', { professors: updatedProfessors });
                } else {
                    this.filterService?.removeFilter('professor');
                }
                this.updatePreview(modalElement);
            }
        });
    }

    private setupRMPRatingFilter(modalElement: HTMLElement): void {
        if (!this.filterService) return;

        const sliderRefs: { rating?: any, difficulty?: any, retake?: any } = {};

        SharedFilterSetup.setupRMPRatingFilter(
            {
                modalElement,
                filterService: this.filterService as any,
                idPrefix: '',
                filterId: 'rmpRating',
                updatePreview: (element: HTMLElement) => this.updatePreview(element)
            },
            sliderRefs
        );
    }

    private setupTermFilter(modalElement: HTMLElement): void {
        if (!this.filterService) return;

        SharedFilterSetup.setupTermFilter({
            modalElement,
            filterService: this.filterService as any,
            filterId: 'term',
            updateFilter: () => this.updateTermFilter(modalElement)
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
                        const labels = checkboxes.querySelectorAll('.department-checkbox-label');
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
        
        // Update only the specific elements that need to change
        this.updateSearchPlaceholder(modalElement);
        this.updateCheckboxGrid(modalElement);
        this.setupDepartmentCheckboxes(modalElement);
    }

    private updateSearchPlaceholder(modalElement: HTMLElement): void {
        const searchInput = modalElement.querySelector('.filter-search[data-filter="department"]') as HTMLInputElement;
        if (searchInput) {
            const searchPlaceholder = this.isCategoryMode ? 
                'Search categories...' : 
                'Search departments...';
            searchInput.placeholder = searchPlaceholder;
        }
    }

    private updateCheckboxGrid(modalElement: HTMLElement): void {
        const checkboxGrid = modalElement.querySelector('#department-checkboxes');
        if (checkboxGrid) {
            const checkboxesHtml = this.isCategoryMode ? 
                this.createCategoryCheckboxes() : 
                this.createIndividualDepartmentCheckboxes();
            checkboxGrid.innerHTML = checkboxesHtml;
        }
    }

    private setupDepartmentCheckboxes(modalElement: HTMLElement): void {
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
        
        // Set up event listeners for new checkboxes
        checkboxes.forEach((checkbox) => {
            const cb = checkbox as HTMLInputElement;
            cb.addEventListener('change', () => {
                this.updateDepartmentFilter(modalElement);
            });
        });
    }

    private createCategoryCheckboxes(): string {
        if (!this.filterService) return '';

        const activeFilter = this.filterService.getActiveFilters().find(f => f.id === 'department');
        const criteria = activeFilter?.criteria as DepartmentFilterCriteria | undefined;
        const activeDepartments = criteria?.departments || [];
        
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
                <label class="department-checkbox-label">
                    <input type="checkbox" class="department-checkbox" value="${category}" ${isChecked ? 'checked' : ''} 
                           ${isIndeterminate ? 'data-indeterminate="true"' : ''}
                           data-filter="department" data-category="true">
                    <span class="department-checkbox-text">${category}</span>
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
        const availableOnlyCheckbox = modalElement.querySelector('#available-only-filter') as HTMLInputElement;
        const minSeatsInput = modalElement.querySelector('#min-seats-filter') as HTMLInputElement;

        const availableOnly = availableOnlyCheckbox?.checked || false;
        const minAvailable = minSeatsInput?.value ? parseInt(minSeatsInput.value) : undefined;

        if (availableOnly || minAvailable) {
            this.filterService?.addFilter('availability', {
                availableOnly,
                minAvailable: minAvailable || undefined
            });
        } else {
            this.filterService?.removeFilter('availability');
        }
        this.updatePreview(modalElement);
    }

    private updateConflictFilter(modalElement: HTMLElement): void {
        const avoidConflictsCheckbox = modalElement.querySelector('#avoid-conflicts-filter') as HTMLInputElement;

        if (avoidConflictsCheckbox?.checked) {
            const selectedCourses = this.courseSelectionService?.getSelectedCourses() || [];
            this.filterService?.addFilter('periodConflict', {
                avoidConflicts: true,
                selectedCourses: selectedCourses
            });
        } else {
            this.filterService?.removeFilter('periodConflict');
        }
        this.updatePreview(modalElement);
    }

    private updateBookmarkFilter(modalElement: HTMLElement): void {
        const checkbox = modalElement.querySelector('#bookmarked-only-filter') as HTMLInputElement;
        const showBookmarkedOnly = checkbox?.checked || false;

        if (showBookmarkedOnly) {
            this.filterService?.addFilter('bookmark', { showBookmarkedOnly: true });
        } else {
            this.filterService?.removeFilter('bookmark');
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

}