import { Course, Department } from '../../types/types'
import { CourseDataService } from '../../services/courseDataService'
import { ThemeSelector } from '../components/ThemeSelector'
import { CourseSelectionService } from '../../services/CourseSelectionService'
import { ConflictDetector } from '../../core/ConflictDetector'
import { ModalService } from '../../services/ModalService'
import { DepartmentController } from './DepartmentController'
import { CourseController } from './CourseController'
import { ScheduleController } from './ScheduleController'
import { SectionInfoModalController } from './SectionInfoModalController'
import { InfoModalController } from './InfoModalController'
import { FilterModalController } from './FilterModalController'
import { FilterService } from '../../services/FilterService'
import { SearchService } from '../../services/searchService'
import { createDefaultFilters, SearchTextFilter } from '../../core/filters'
import { UIStateManager } from './UIStateManager'
import { TimestampManager } from './TimestampManager'
import { OperationManager, DebouncedOperation } from '../../utils/RequestCancellation'
import { DepartmentSyncService } from '../../services/DepartmentSyncService'

export class MainController {
    private courseDataService: CourseDataService;
    private themeSelector: ThemeSelector;
    private courseSelectionService: CourseSelectionService;
    private conflictDetector: ConflictDetector;
    private modalService: ModalService;
    private departmentController: DepartmentController;
    private courseController: CourseController;
    private scheduleController: ScheduleController;
    private sectionInfoModalController: SectionInfoModalController;
    private infoModalController: InfoModalController;
    private filterModalController: FilterModalController;
    private searchService: SearchService;
    private filterService: FilterService;
    private uiStateManager: UIStateManager;
    private timestampManager: TimestampManager;
    private operationManager: OperationManager;
    private debouncedSearch: DebouncedOperation;
    private departmentSyncService: DepartmentSyncService;
    private allDepartments: Department[] = [];


    constructor() {
        this.courseDataService = new CourseDataService();
        this.themeSelector = new ThemeSelector();
        this.courseSelectionService = new CourseSelectionService();
        this.conflictDetector = new ConflictDetector();
        this.modalService = new ModalService();
        this.departmentController = new DepartmentController();
        
        // Initialize search and filter services
        this.searchService = new SearchService();
        this.filterService = new FilterService(this.searchService);
        
        // Initialize managers (before any event listeners that might use them)
        this.uiStateManager = new UIStateManager();
        this.timestampManager = new TimestampManager();
        this.operationManager = new OperationManager();
        this.debouncedSearch = new DebouncedOperation(this.operationManager, 'search', 300);
        
        // Initialize controllers
        this.courseController = new CourseController(this.courseSelectionService);
        this.scheduleController = new ScheduleController(this.courseSelectionService);
        this.sectionInfoModalController = new SectionInfoModalController(this.modalService);
        this.infoModalController = new InfoModalController(this.modalService);
        this.filterModalController = new FilterModalController(this.modalService);
        
        // Connect filter service to course controller
        this.courseController.setFilterService(this.filterService);
        
        // Connect filter service and course data to filter modal
        this.filterModalController.setFilterService(this.filterService);
        
        // Set modal controllers for ScheduleController
        this.scheduleController.setSectionInfoModalController(this.sectionInfoModalController);
        
        // Initialize department synchronization service
        this.departmentSyncService = new DepartmentSyncService(this.filterService, this.departmentController);
        this.departmentController.setDepartmentSyncService(this.departmentSyncService);
        this.departmentSyncService.setFilterModalController(this.filterModalController);
        
        // Wire up state preservation for dropdown states
        this.scheduleController.setStatePreserver({
            preserve: () => this.preserveDropdownStates(),
            restore: (states) => this.restoreDropdownStates(states)
        });
        
        // Initialize tracking for course changes
        const initialSelectedCourses = this.courseSelectionService.getSelectedCourses();
        this.previousSelectedCoursesCount = initialSelectedCourses.length;
        this.previousSelectedCoursesMap = new Map();
        initialSelectedCourses.forEach(sc => {
            this.previousSelectedCoursesMap.set(sc.course.id, sc.selectedSectionNumber);
        });
        
        // IMPORTANT: Initialize filters LAST (triggers events that use operationManager)
        this.initializeFilters();
        
        this.init();
    }

    private initializeFilters(): void {
        const filters = createDefaultFilters();
        filters.forEach(filter => {
            this.filterService.registerFilter(filter);
        });

        // Register SearchTextFilter
        const searchTextFilter = new SearchTextFilter();
        this.filterService.registerFilter(searchTextFilter);

        // Set up filter change listener to refresh UI
        this.filterService.addEventListener((event) => {
            this.refreshCurrentView();
        });

        // Load saved filters from storage
        this.filterService.loadFiltersFromStorage();
        
        // Initialize filter button state
        setTimeout(() => this.updateFilterButtonState(), 100);
    }

    private async init(): Promise<void> {
        this.uiStateManager.showLoadingState();
        await this.loadCourseData();
        this.departmentController.displayDepartments();
        this.setupEventListeners();
        this.setupCourseSelectionListener();
        this.courseController.displaySelectedCourses();
        
        
        this.uiStateManager.syncHeaderHeights();
        this.uiStateManager.setupHeaderResizeObserver();
    }

    private async loadCourseData(): Promise<void> {
        try {
            const scheduleDB = await this.courseDataService.loadCourseData();
            this.allDepartments = scheduleDB.departments;
            this.departmentController.setAllDepartments(this.allDepartments);
            this.courseController.setAllDepartments(this.allDepartments);
            this.courseSelectionService.setAllDepartments(this.allDepartments);
            
            // Initialize search service with course data
            this.searchService.setCourseData(this.allDepartments);
            
            // Initialize filter modal with course data
            this.filterModalController.setCourseData(this.allDepartments);
            
            // Initialize the department sync service after all data is loaded
            this.departmentSyncService.initialize();
            
            
            // IMPORTANT: Reconstruct Section objects after course data is loaded
            this.courseSelectionService.reconstructSectionObjects();
            
            this.timestampManager.updateClientTimestamp();
            this.timestampManager.loadServerTimestamp();
            
            // Expose debug methods globally for testing (development only)
            if (typeof window !== 'undefined') {
                (window as any).debugDepartmentSync = {
                    debug: () => this.departmentSyncService.debugVisualSync(),
                    refresh: () => this.departmentSyncService.forceVisualRefresh(),
                    enableDebug: () => this.departmentSyncService.enableDebugMode(),
                    disableDebug: () => this.departmentSyncService.disableDebugMode(),
                    getActive: () => this.departmentSyncService.getActiveDepartments(),
                    getDescription: () => this.departmentSyncService.getSelectionDescription()
                };
            }
        } catch (error) {
            console.error('Failed to load course data:', error);
            this.uiStateManager.showErrorMessage('Failed to load course data. Please try refreshing the page.');
        }
    }


    private setupEventListeners(): void {
        // Department selection
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            
            
            if (target.classList.contains('department-item')) {
                const deptId = target.dataset.deptId;
                if (deptId) {
                    // Check if this is a multi-select click (Ctrl/Cmd key)
                    const multiSelect = (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey;
                    
                    // Use the department controller which will now use the sync service
                    this.departmentController.handleDepartmentClick(deptId, multiSelect);
                    
                    // The sync service will trigger refreshCurrentView through filter changes
                    // No need to manually display courses anymore
                }
            }
            
            if (target.classList.contains('section-badge')) {
                target.classList.toggle('selected');
            }
            
            if (target.classList.contains('course-select-btn')) {
                const courseElement = target.closest('.course-item, .course-card') as HTMLElement;
                if (courseElement) {
                    this.courseController.toggleCourseSelection(courseElement);
                }
            }

            if (target.classList.contains('course-remove-btn')) {
                const course = this.courseController.getCourseFromElement(target as HTMLElement);
                if (course) {
                    // Directly remove course (remove button means always unselect)
                    this.courseSelectionService.unselectCourse(course);
                }
            }

            // Handle section-related clicks FIRST (before dropdown logic)
            if (target.classList.contains('section-select-btn')) {
                e.stopPropagation();
                const courseElement = target.closest('.schedule-course-item') as HTMLElement;
                const sectionNumber = target.dataset.section;
                
                if (courseElement && sectionNumber) {
                    const course = this.scheduleController.getCourseFromElement(courseElement);
                    if (course) {
                        this.scheduleController.handleSectionSelection(course, sectionNumber);
                    }
                }
                return;
            }

            // Prevent dropdown closing for any other section-related clicks
            if (target.classList.contains('section-option') || target.closest('.section-option') ||
                target.classList.contains('section-info') || target.closest('.section-info') ||
                target.classList.contains('section-number') || 
                target.classList.contains('section-schedule') || 
                target.classList.contains('section-professor')) {
                e.stopPropagation();
                e.preventDefault();
                return;
            }

            if (target.classList.contains('dropdown-trigger') || target.closest('.dropdown-trigger')) {
                const triggerElement = target.classList.contains('dropdown-trigger') 
                    ? target 
                    : target.closest('.dropdown-trigger') as HTMLElement;
                    
                if (triggerElement) {
                    // Only trigger dropdown if clicking on course header area (not section-related elements)
                    const shouldToggle = !target.classList.contains('course-remove-btn') && 
                        !target.classList.contains('section-select-btn') &&
                        !target.classList.contains('section-number') && 
                        !target.classList.contains('section-schedule') && 
                        !target.classList.contains('section-professor') &&
                        !target.closest('.section-option') &&
                        !target.closest('.section-info') &&
                        !target.closest('.schedule-sections-container');
                        
                    if (shouldToggle) {
                        this.toggleCourseDropdown(triggerElement);
                    }
                }
            }


            if (target.closest('.course-item, .course-card') && !target.classList.contains('course-select-btn') && !target.classList.contains('section-badge')) {
                const courseElement = target.closest('.course-item, .course-card') as HTMLElement;
                if (courseElement) {
                    this.courseController.selectCourse(courseElement);
                }
            }
        });

        // Search functionality with debouncing and cancellation
        const searchInput = document.getElementById('search-input') as HTMLInputElement;
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.trim();
                
                // Use debounced operation for search to prevent excessive filtering
                this.debouncedSearch.execute(async (cancellationToken) => {
                    cancellationToken.throwIfCancelled();
                    
                    // Update search text filter in FilterService
                    if (query.length > 0) {
                        this.filterService.addFilter('searchText', { query });
                    } else {
                        this.filterService.removeFilter('searchText');
                    }
                    
                    cancellationToken.throwIfCancelled();
                    
                    // Sync modal search input
                    this.syncModalSearchInput(query);
                    
                    return Promise.resolve();
                }).catch(error => {
                    // Ignore cancellation errors, log others
                    if (error.name !== 'CancellationError') {
                        console.error('Search error:', error);
                    }
                });
            });
        }

        // Clear selection
        const clearButton = document.getElementById('clear-selection');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                this.clearSelection();
            });
        }

        // Schedule navigation
        const scheduleButton = document.getElementById('schedule-btn');
        if (scheduleButton) {
            scheduleButton.addEventListener('click', () => {
                this.uiStateManager.togglePage();
                if (this.uiStateManager.currentPage === 'schedule') {
                    // Log selected section data for debugging  
                    const selectedCourses = this.courseSelectionService.getSelectedCourses();
                    console.log('=== SCHEDULE PAGE LOADED ===');
                    console.log(`Found ${selectedCourses.length} selected courses with sections:`);
                    
                    selectedCourses.forEach(sc => {
                        const hasSection = sc.selectedSection !== null;
                        console.log(`${sc.course.department.abbreviation}${sc.course.number}: section ${sc.selectedSectionNumber} ${hasSection ? '✓' : '✗'}`);
                        if (hasSection && sc.selectedSection) {
                            console.log(`  Term: ${sc.selectedSection.term}, Periods: ${sc.selectedSection.periods.length}`);
                            console.log(`  Full section object:`, sc.selectedSection);
                            
                            // Log each period in detail
                            sc.selectedSection.periods.forEach((period, idx) => {
                                console.log(`    Period ${idx + 1}:`, {
                                    type: period.type,
                                    professor: period.professor,
                                    startTime: period.startTime,
                                    endTime: period.endTime,
                                    days: Array.from(period.days),
                                    location: period.location,
                                    building: period.building,
                                    room: period.room
                                });
                                
                                // Calculate and log time slots for debugging
                                const startSlot = Math.floor(((period.startTime.hours * 60 + period.startTime.minutes) - (7 * 60)) / 10);
                                const endSlot = Math.floor(((period.endTime.hours * 60 + period.endTime.minutes) - (7 * 60)) / 10);
                                const duration = endSlot - startSlot;
                                console.log(`      Time slots: ${startSlot} to ${endSlot} (span ${duration} rows)`);
                            });
                        }
                    });
                    console.log('=== END SCHEDULE SECTION DATA ===\n');
                    
                    this.scheduleController.displayScheduleSelectedCourses();
                    this.scheduleController.renderScheduleGrids();
                }
            });
        }

        // View toggle buttons
        const viewListBtn = document.getElementById('view-list');
        const viewGridBtn = document.getElementById('view-grid');
        
        if (viewListBtn) {
            viewListBtn.addEventListener('click', () => {
                this.uiStateManager.setView('list');
                this.refreshCurrentView();
            });
        }
        
        if (viewGridBtn) {
            viewGridBtn.addEventListener('click', () => {
                this.uiStateManager.setView('grid');
                this.refreshCurrentView();
            });
        }

        // Filter button
        const filterButton = document.getElementById('filter-btn');
        if (filterButton) {
            filterButton.addEventListener('click', () => {
                this.filterModalController.show();
            });
        }
    }

    private refreshCurrentView(): void {
        const selectedDepartment = this.departmentController.getSelectedDepartment();
        const hasFilters = !this.filterService.isEmpty();
        
        // Start a new render operation with cancellation support
        const cancellationToken = this.operationManager.startOperation('render', 'New render requested');
        
        let coursesToDisplay: Course[] = [];
        
        if (hasFilters) {
            // Handle all filters (including search text)
            const baseCourses = selectedDepartment ? selectedDepartment.courses : this.getAllCourses();
            coursesToDisplay = this.filterService.filterCourses(baseCourses);
            this.updateFilteredHeader(coursesToDisplay.length, selectedDepartment);
        } else if (selectedDepartment) {
            // Show department courses without filters
            coursesToDisplay = selectedDepartment.courses;
            this.updateDepartmentHeader(selectedDepartment);
        } else {
            // No filters, no department selected - show empty state
            coursesToDisplay = [];
            this.updateDefaultHeader();
        }
        
        // Display courses with cancellation support
        this.displayCoursesWithCancellation(coursesToDisplay, cancellationToken);
        
        // Save current filter state
        if (hasFilters) {
            this.filterService.saveFiltersToStorage();
        }
        
        // Update filter button appearance and sync search input
        this.updateFilterButtonState();
        this.syncSearchInputFromFilters();
    }
    
    private async displayCoursesWithCancellation(coursesToDisplay: Course[], cancellationToken: any): Promise<void> {
        try {
            // Pass cancellation token to the progressive renderer
            await this.courseController.displayCoursesWithCancellation(
                coursesToDisplay, 
                this.uiStateManager.currentView,
                cancellationToken
            );
            
            // Mark operation as complete
            this.operationManager.completeOperation('render');
            
        } catch (error) {
            if (error.name === 'CancellationError') {
                // Render was cancelled, not an error
                return;
            }
            console.error('Error displaying courses:', error);
            this.operationManager.completeOperation('render');
        }
    }

    private updateFilterButtonState(): void {
        const filterButton = document.getElementById('filter-btn');
        if (filterButton && this.filterService) {
            const hasActiveFilters = !this.filterService.isEmpty();
            const filterCount = this.filterService.getFilterCount();
            
            if (hasActiveFilters) {
                filterButton.classList.add('active');
                filterButton.title = `${filterCount} filter${filterCount === 1 ? '' : 's'} active - Click to modify`;
            } else {
                filterButton.classList.remove('active');
                filterButton.title = 'Filter courses';
            }
        }
    }

    private clearSelection(): void {
        // Clear selected sections
        document.querySelectorAll('.section-badge.selected').forEach(badge => {
            badge.classList.remove('selected');
        });

        // Clear search
        const searchInput = document.getElementById('search-input') as HTMLInputElement;
        if (searchInput) {
            searchInput.value = '';
        }

        // Reset to default state
        const courseContainer = document.getElementById('course-container');
        if (courseContainer) {
            courseContainer.innerHTML = '<div class="loading-message">Select a department to view courses...</div>';
        }

        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            contentHeader.textContent = 'Course Listings';
        }

        this.departmentController.clearDepartmentSelection();
        this.courseController.clearCourseSelection();
        this.courseController.displaySelectedCourses();
    }






    private previousSelectedCoursesCount = 0;
    private previousSelectedCoursesMap = new Map<string, string | null>();

    private setupCourseSelectionListener(): void {
        this.courseSelectionService.onSelectionChange((selectedCourses) => {
            const currentCount = selectedCourses.length;
            const isCoursesAddedOrRemoved = currentCount !== this.previousSelectedCoursesCount;
            
            // Create current state map for comparison
            const currentCoursesMap = new Map<string, string | null>();
            selectedCourses.forEach(sc => {
                currentCoursesMap.set(sc.course.id, sc.selectedSectionNumber);
            });
            
            // Always update main course UI
            this.courseController.refreshCourseSelectionUI();
            this.courseController.displaySelectedCourses();
            
            if (isCoursesAddedOrRemoved) {
                // Full refresh needed when courses are added/removed
                this.scheduleController.displayScheduleSelectedCourses();
            } else {
                // Check if only section selections changed
                let sectionSelectionsChanged = false;
                for (const [courseId, selectedSection] of currentCoursesMap) {
                    const previousSection = this.previousSelectedCoursesMap.get(courseId);
                    if (previousSection !== selectedSection) {
                        sectionSelectionsChanged = true;
                        
                        // Update visual state for this course
                        const selectedCourse = selectedCourses.find(sc => sc.course.id === courseId);
                        if (selectedCourse) {
                            this.scheduleController.updateSectionButtonStates(selectedCourse.course, selectedSection);
                        }
                    }
                }
                
                // Update schedule grids if any sections changed
                if (sectionSelectionsChanged && this.uiStateManager.currentPage === 'schedule') {
                    this.scheduleController.renderScheduleGrids();
                }
            }
            
            // Update tracking state
            this.previousSelectedCoursesCount = currentCount;
            this.previousSelectedCoursesMap = new Map(currentCoursesMap);
        });
    }


    // Public methods for easy access to selected courses
    public getSelectedCourses() {
        return this.courseSelectionService.getSelectedCourses();
    }

    public getSelectedCoursesCount(): number {
        return this.courseSelectionService.getSelectedCoursesCount();
    }

    public getCourseSelectionService(): CourseSelectionService {
        return this.courseSelectionService;
    }

    public getFilterService(): FilterService {
        return this.filterService;
    }

    public getModalService(): ModalService {
        return this.modalService;
    }

    public getSectionInfoModalController(): SectionInfoModalController {
        return this.sectionInfoModalController;
    }

    public getInfoModalController(): InfoModalController {
        return this.infoModalController;
    }

    private toggleCourseDropdown(triggerElement: HTMLElement): void {
        const courseItem = triggerElement.closest('.schedule-course-item');
        if (!courseItem) return;

        const isCollapsed = courseItem.classList.contains('collapsed');
        
        if (isCollapsed) {
            // Expand
            courseItem.classList.remove('collapsed');
            courseItem.classList.add('expanded');
        } else {
            // Collapse
            courseItem.classList.remove('expanded');
            courseItem.classList.add('collapsed');
        }
    }

    private preserveDropdownStates(): Map<string, boolean> {
        const states = new Map<string, boolean>();
        document.querySelectorAll('.schedule-course-item').forEach(item => {
            const course = this.scheduleController.getCourseFromElement(item as HTMLElement);
            if (course) {
                const isExpanded = item.classList.contains('expanded');
                states.set(course.id, isExpanded);
            }
        });
        return states;
    }

    private restoreDropdownStates(states: Map<string, boolean>): void {
        document.querySelectorAll('.schedule-course-item').forEach(item => {
            const course = this.scheduleController.getCourseFromElement(item as HTMLElement);
            if (course && states.has(course.id)) {
                const wasExpanded = states.get(course.id);
                if (wasExpanded) {
                    item.classList.remove('collapsed');
                    item.classList.add('expanded');
                } else {
                    item.classList.remove('expanded');
                    item.classList.add('collapsed');
                }
            }
        });
    }

    private getAllCourses(): Course[] {
        const allCourses: Course[] = [];
        this.allDepartments.forEach(dept => {
            allCourses.push(...dept.courses);
        });
        return allCourses;
    }

    private syncModalSearchInput(query: string): void {
        // Sync the modal search input if the modal is currently open
        this.filterModalController.syncSearchInputFromMain(query);
    }

    private syncSearchInputFromFilters(): void {
        const searchInput = document.getElementById('search-input') as HTMLInputElement;
        if (searchInput) {
            const searchTextFilter = this.filterService.getActiveFilters().find(f => f.id === 'searchText');
            const currentQuery = searchTextFilter?.criteria?.query || '';
            if (searchInput.value !== currentQuery) {
                searchInput.value = currentQuery;
            }
        }
    }

    private updateFilteredHeader(resultCount: number, selectedDepartment: Department | null): void {
        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            const filters = this.filterService.getActiveFilters();
            const searchTextFilter = filters.find(f => f.id === 'searchText');
            
            if (searchTextFilter && filters.length === 1) {
                // Only search text filter
                const query = searchTextFilter.criteria.query;
                contentHeader.textContent = `Search: "${query}" (${resultCount} results)`;
            } else if (searchTextFilter) {
                // Search text + other filters
                const query = searchTextFilter.criteria.query;
                const otherFilters = filters.length - 1;
                contentHeader.textContent = `Search: "${query}" + ${otherFilters} filter${otherFilters === 1 ? '' : 's'} (${resultCount} results)`;
            } else {
                // Only other filters
                const filterCount = filters.length;
                contentHeader.textContent = `Filtered Results: ${filterCount} filter${filterCount === 1 ? '' : 's'} (${resultCount} courses)`;
            }
        }
    }

    private updateDepartmentHeader(department: Department): void {
        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            contentHeader.textContent = `${department.name} (${department.abbreviation})`;
        }
    }

    private updateDefaultHeader(): void {
        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            contentHeader.textContent = 'Course Listings';
        }
    }

}