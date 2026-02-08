import { ModalService } from '../../services/ui/ModalService';
import { ScheduleFilterService } from '../../services/filtering/ScheduleFilterService';
import { SelectedCourse, AcademicTerm } from '../../types/schedule';
import { BaseModal } from '../components/BaseModal';
import { getAllSections } from '../../utils/courseUtils';
import { SharedFilterComponents } from '../components/SharedFilterComponents';
import { SharedFilterSetup } from '../components/SharedFilterSetup';
import { SectionCodeFilterCriteria, PeriodProfessorFilterCriteria, PeriodTermFilterCriteria, PeriodAvailabilityFilterCriteria, PeriodConflictFilterCriteria, GraduateLevelFilterCriteria } from '../../types/filters';

export class ScheduleFilterModalController extends BaseModal {
    private scheduleFilterService: ScheduleFilterService | null = null;
    private selectedCourses: SelectedCourse[] = [];
    private mode: 'filter' | 'auto-schedule' = 'filter';
    private scheduleController?: any;

    constructor(modalService: ModalService, scheduleController?: any) {
        super(modalService);
        this.scheduleController = scheduleController;
    }

    setScheduleFilterService(scheduleFilterService: ScheduleFilterService): void {
        this.scheduleFilterService = scheduleFilterService;
    }

    setSelectedCourses(selectedCourses: SelectedCourse[]): void {
        this.selectedCourses = selectedCourses;
    }

    setMode(mode: 'filter' | 'auto-schedule'): void {
        this.mode = mode;
    }

    updateSelectedCourses(selectedCourses: SelectedCourse[]): void {
        this.selectedCourses = selectedCourses;
    }

    show(): string {
        if (!this.scheduleFilterService) {
            console.error('ScheduleFilterService not set on ScheduleFilterModalController');
            return '';
        }

        const modalElement = this.createModalElement();
        const id = this.showModal(modalElement, { closeOnBackdrop: true, closeOnEscape: true });

        // Set up event listeners after modal is shown
        setTimeout(() => {
            this.setupFilterModalEventListeners(modalElement);
            this.initializeFormState(modalElement);
        }, 50);

        return id;
    }

    private createModalElement(): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop filter-modal';

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
                        <button class="modal-close" data-modal-close>×</button>
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
                            <button class="modal-btn btn-primary" id="apply-filters">${this.mode === 'auto-schedule' ? 'Generate Schedule' : 'Apply'}</button>
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

        backdrop.querySelector('[data-modal-close]')?.addEventListener('click', () => this.hide());

        return backdrop;
    }

    private createFilterModalContent(): string {
        return `
            <div class="filter-sections">
                ${this.createSearchTextFilter()}
                ${this.createProfessorFilter()}
                ${this.createRMPRatingFilter()}
                ${this.createTermFilter()}
                ${this.createGraduateLevelFilter()}
                ${this.createAvailabilityFilter()}
                ${this.createConflictFilter()}
                ${this.createWakeUpTimeFilter()}
            </div>
        `;
    }

    private createGraduateLevelFilter(): string {
        if (!this.scheduleFilterService) return '';

        const activeFilter = this.scheduleFilterService.getActiveFilters().find(f => f.id === 'graduateLevel');
        const criteria = activeFilter?.criteria as GraduateLevelFilterCriteria | undefined;
        const currentLevel = criteria?.level || 'all';

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
                </div>
            </div>
        `;
    }

    private createSearchTextFilter(): string {
        if (!this.scheduleFilterService) return '';

        const searchFilter = this.scheduleFilterService.getActiveFilters().find(f => f.id === 'sectionCode');
        const criteria = searchFilter?.criteria as SectionCodeFilterCriteria | undefined;
        const currentQuery = criteria?.codes?.[0] || '';

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

        return SharedFilterComponents.createProfessorFilter({
            idPrefix: 'schedule',
            filterId: 'periodProfessor',
            activeProfessors
        });
    }

    private createRMPRatingFilter(): string {
        if (!this.scheduleFilterService) return '';

        const activeFilter = this.scheduleFilterService.getActiveFilters().find(f => f.id === 'periodRmpRating');

        return SharedFilterComponents.createRMPRatingFilter({
            idPrefix: 'schedule',
            filterId: 'periodRmpRating',
            activeFilter
        });
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

        return SharedFilterComponents.createAvailabilityFilter({
            idPrefix: '',
            filterId: 'periodAvailability',
            availableOnly: activeAvailability.availableOnly,
            minAvailable: activeAvailability.minAvailable
        });
    }

    private createConflictFilter(): string {
        if (!this.scheduleFilterService) return '';

        const activeConflictDetection = this.getActiveConflictDetection();
        const hasCalendarEvents = this.hasCalendarEventsBlocked();
        const calendarEventCount = this.scheduleController
            ? this.scheduleController.getCalendarEventCount()
            : 0;
        const localEventCount = this.scheduleController
            ? this.scheduleController.getLocalEventCount()
            : 0;
        const totalEventCount = calendarEventCount + localEventCount;

        return SharedFilterComponents.createConflictFilter({
            idPrefix: '',
            filterId: 'periodConflict',
            avoidConflicts: activeConflictDetection.avoidConflicts,
            includeCalendarToggle: true,
            hasCalendarEvents: hasCalendarEvents,
            calendarEventCount: totalEventCount
        });
    }


    private getActiveProfessors(): string[] {
        const filter = this.scheduleFilterService!.getActiveFilters().find(f => f.id === 'periodProfessor');
        const criteria = filter?.criteria as PeriodProfessorFilterCriteria | undefined;
        return criteria?.professors || [];
    }

    private getActiveTerms(): AcademicTerm[] {
        const filter = this.scheduleFilterService!.getActiveFilters().find(f => f.id === 'periodTerm');
        const criteria = filter?.criteria as PeriodTermFilterCriteria | undefined;
        return criteria?.terms || [];
    }


    private getActiveAvailability(): { availableOnly: boolean; minAvailable?: number } {
        const filter = this.scheduleFilterService!.getActiveFilters().find(f => f.id === 'periodAvailability');
        const criteria = filter?.criteria as PeriodAvailabilityFilterCriteria | undefined;
        return criteria || { availableOnly: false };
    }

    private getActiveConflictDetection(): { avoidConflicts: boolean } {
        const filter = this.scheduleFilterService!.getActiveFilters().find(f => f.id === 'periodConflict');
        const criteria = filter?.criteria as PeriodConflictFilterCriteria | undefined;
        return criteria || { avoidConflicts: false };
    }

    private getActiveWakeUpTime(): { hours: number; minutes: number } | null {
        const filter = this.scheduleFilterService!.getActiveFilters().find(f => f.id === 'wakeUpTime');
        const criteria = filter?.criteria as any;
        return criteria?.wakeUpTime || null;
    }

    private hasCalendarEventsBlocked(): boolean {
        const filter = this.scheduleFilterService!.getActiveFilters().find(f => f.id === 'periodConflict');
        if (!filter) return false;

        const criteria = filter.criteria as any;
        const blockedSlots = criteria.blockedSlots || [];
        return blockedSlots.some((slot: any) => slot.id.includes('calendar-') || slot.id.match(/^[0-9a-f-]{36}/));
    }

    private createWakeUpTimeFilter(): string {
        const activeWakeUpTime = this.getActiveWakeUpTime();
        const timeValue = activeWakeUpTime
            ? `${String(activeWakeUpTime.hours).padStart(2, '0')}:${String(activeWakeUpTime.minutes).padStart(2, '0')}`
            : '';

        return `
            <div class="filter-section">
                <div class="filter-section-header">
                    <h4 class="filter-section-title">Wake-Up Time</h4>
                </div>
                <div class="filter-section-content">
                    <label class="wake-up-time-label">
                        Earliest class start time
                    </label>
                    <input
                        type="time"
                        id="wake-up-time-input"
                        class="wake-up-time-input"
                        value="${timeValue}"
                    >
                    <p class="wake-up-time-hint">
                        Excludes sections that start before this time
                    </p>
                    <button class="filter-clear-btn" id="clear-wake-up-time" style="display: ${timeValue ? 'block' : 'none'}">
                        Clear
                    </button>
                </div>
            </div>
        `;
    }


    private setupFilterModalEventListeners(modalElement: HTMLElement): void {

        // Search text filter
        this.setupSearchTextFilter(modalElement);

        // Professor filter
        this.setupProfessorFilter(modalElement);

        // RMP Rating filter
        this.setupRMPRatingFilter(modalElement);

        // Term checkboxes
        modalElement.querySelectorAll('input[name="periodTerm"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateTermFilter();
                this.updatePreview(modalElement);
            });
        });

        // Graduate level filter (3-position segmented control)
        const graduateLevelControl = modalElement.querySelector('#graduate-level-filter');
        if (graduateLevelControl) {
            graduateLevelControl.querySelectorAll('.segmented-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const target = e.target as HTMLElement;
                    const level = target.dataset.level as 'all' | 'undergraduate' | 'graduate';

                    // Update active state
                    graduateLevelControl.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
                    target.classList.add('active');

                    this.updateGraduateLevelFilter(level);
                    this.updatePreview(modalElement);
                });
            });
        }

        // Availability filter
        SharedFilterSetup.setupAvailabilityFilter({
            modalElement,
            idPrefix: '',
            updateFilter: () => {
                this.updateAvailabilityFilter();
                this.updatePreview(modalElement);
            }
        });

        // Conflict detection filter
        SharedFilterSetup.setupConflictFilter({
            modalElement,
            idPrefix: '',
            updateFilter: () => {
                this.updateConflictFilter();
                this.updatePreview(modalElement);
            }
        });

        const calendarConflictToggle = modalElement.querySelector('#avoid-calendar-filter');
        if (calendarConflictToggle) {
            calendarConflictToggle.addEventListener('change', (e) => {
                this.handleCalendarEventsToggle((e.target as HTMLInputElement).checked, modalElement);
            });
        }

        // Wake-up time filter
        const wakeUpInput = modalElement.querySelector('#wake-up-time-input');
        if (wakeUpInput) {
            wakeUpInput.addEventListener('change', () => {
                this.handleWakeUpTimeChange(modalElement);
            });
        }

        const clearWakeUpBtn = modalElement.querySelector('#clear-wake-up-time');
        if (clearWakeUpBtn) {
            clearWakeUpBtn.addEventListener('click', () => {
                this.handleClearWakeUpTime(modalElement);
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
                this.setupFilterModalEventListeners(modalElement);
            }
        });

        // Apply filters button
        modalElement.querySelector('#apply-filters')?.addEventListener('click', async () => {
            if (this.mode === 'auto-schedule') {
                await this.handleAutoScheduleGenerate();
            } else {
                this.hide();
            }
        });
    }



    private updateTermFilter(): void {
        if (!this.modalId) return;

        const modalElement = document.getElementById(this.modalId);
        if (modalElement) {
            const checkedTerms = Array.from(modalElement.querySelectorAll('input[name="periodTerm"]:checked'))
                .map(cb => (cb as HTMLInputElement).value as AcademicTerm);

            if (checkedTerms.length > 0) {
                this.scheduleFilterService!.addFilter('periodTerm', { terms: checkedTerms });
            } else {
                this.scheduleFilterService!.removeFilter('periodTerm');
            }
        }
    }

    private updateAvailabilityFilter(): void {
        if (!this.modalId) return;

        const modalElement = document.getElementById(this.modalId);
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
        if (!this.modalId) return;

        const modalElement = document.getElementById(this.modalId);
        if (modalElement) {
            const avoidConflicts = (modalElement.querySelector('#avoid-conflicts-filter') as HTMLInputElement)?.checked || false;

            if (avoidConflicts) {
                const existingFilter = this.scheduleFilterService!.getActiveFilters().find(f => f.id === 'periodConflict');
                const existingBlockedSlots = (existingFilter?.criteria as any)?.blockedSlots || [];

                this.scheduleFilterService!.addFilter('periodConflict', {
                    avoidConflicts: true,
                    blockedSlots: existingBlockedSlots
                });
            } else {
                this.scheduleFilterService!.removeFilter('periodConflict');
            }
        }
    }

    private updateGraduateLevelFilter(level: 'all' | 'undergraduate' | 'graduate'): void {
        if (level === 'all') {
            this.scheduleFilterService!.removeFilter('graduateLevel');
        } else {
            this.scheduleFilterService!.addFilter('graduateLevel', { level });
        }
    }

    private initializeFormState(modalElement: HTMLElement): void {

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

    private setupProfessorFilter(modalElement: HTMLElement): void {
        if (!this.scheduleFilterService) return;

        const professorOptions = this.scheduleFilterService.getFilterOptions('periodProfessor', this.selectedCourses) || [];
        const professors = professorOptions.map((option: any) => option.value).filter((prof: string) => prof && prof.trim() !== 'TBA');

        SharedFilterSetup.setupProfessorFilter({
            modalElement,
            filterService: this.scheduleFilterService as any,
            idPrefix: 'schedule',
            filterId: 'periodProfessor',
            professors,
            updateFilter: (updatedProfessors: string[]) => {
                if (updatedProfessors.length > 0) {
                    this.scheduleFilterService?.addFilter('periodProfessor', { professors: updatedProfessors });
                } else {
                    this.scheduleFilterService?.removeFilter('periodProfessor');
                }
                this.updatePreview(modalElement);
            }
        });
    }

    private setupRMPRatingFilter(modalElement: HTMLElement): void {
        if (!this.scheduleFilterService) return;

        const sliderRefs: { rating?: any, difficulty?: any, retake?: any } = {};

        SharedFilterSetup.setupRMPRatingFilter(
            {
                modalElement,
                filterService: this.scheduleFilterService as any,
                idPrefix: 'schedule',
                filterId: 'periodRmpRating',
                updatePreview: (element: HTMLElement) => this.updatePreview(element)
            },
            sliderRefs
        );
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
        if (this.modalId) {
            const modalElement = document.getElementById(this.modalId);
            if (modalElement) {
                const searchInput = modalElement.querySelector('#modal-search-input') as HTMLInputElement;
                if (searchInput && searchInput.value !== query) {
                    searchInput.value = query;
                }
            }
        }
    }

    private handleWakeUpTimeChange(modalElement: HTMLElement): void {
        const input = modalElement.querySelector('#wake-up-time-input') as HTMLInputElement;
        const clearBtn = modalElement.querySelector('#clear-wake-up-time') as HTMLElement;

        if (input.value && input.value.trim()) {
            const [hours, minutes] = input.value.split(':').map(Number);
            if (!isNaN(hours) && !isNaN(minutes)) {
                this.scheduleFilterService!.addFilter('wakeUpTime', {
                    wakeUpTime: { hours, minutes }
                });
                clearBtn.style.display = 'block';
            }
        } else {
            this.scheduleFilterService!.removeFilter('wakeUpTime');
            clearBtn.style.display = 'none';
        }

        this.updatePreview(modalElement);
    }

    private handleClearWakeUpTime(modalElement: HTMLElement): void {
        const input = modalElement.querySelector('#wake-up-time-input') as HTMLInputElement;
        const clearBtn = modalElement.querySelector('#clear-wake-up-time') as HTMLElement;

        input.value = '';
        this.scheduleFilterService!.removeFilter('wakeUpTime');
        clearBtn.style.display = 'none';

        this.updatePreview(modalElement);
    }

    private handleCalendarEventsToggle(checked: boolean, modalElement: HTMLElement): void {
        if (checked) {
            const calendarSlots = this.scheduleController.getAllCalendarBlockedTimes();

            const existingFilter = this.scheduleFilterService!.getActiveFilters().find(f => f.id === 'periodConflict');
            const existingSlots = (existingFilter?.criteria as any)?.blockedSlots || [];

            const nonCalendarSlots = existingSlots.filter((slot: any) => !slot.id.includes('calendar-') && !slot.id.match(/^[0-9a-f-]{36}/));

            this.scheduleFilterService!.addFilter('periodConflict', {
                avoidConflicts: true,
                blockedSlots: [...nonCalendarSlots, ...calendarSlots]
            });
        } else {
            const existingFilter = this.scheduleFilterService!.getActiveFilters().find(f => f.id === 'periodConflict');
            if (existingFilter) {
                const existingSlots = (existingFilter.criteria as any)?.blockedSlots || [];
                const filteredSlots = existingSlots.filter((slot: any) => !slot.id.includes('calendar-') && !slot.id.match(/^[0-9a-f-]{36}/));

                if (filteredSlots.length > 0 || (existingFilter.criteria as any)?.avoidConflicts) {
                    this.scheduleFilterService!.addFilter('periodConflict', {
                        avoidConflicts: (existingFilter.criteria as any)?.avoidConflicts || false,
                        blockedSlots: filteredSlots
                    });
                } else {
                    this.scheduleFilterService!.removeFilter('periodConflict');
                }
            }
        }

        this.updatePreview(modalElement);
    }

    private handleOpenCalendarPanel(): void {
        this.hide();
        this.scheduleController.openCalendarEventsPanel();
    }

    private async handleAutoScheduleGenerate(): Promise<void> {
        this.hide();
        await this.scheduleController.generateSchedulesWithActiveFilters(this.selectedCourses);
    }
}