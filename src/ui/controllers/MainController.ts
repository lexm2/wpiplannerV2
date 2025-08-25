import { Course, Department } from '../../types/types'
import { CourseDataService } from '../../services/courseDataService'
import { ThemeSelector } from '../components/ThemeSelector'
import { ScheduleSelector } from '../components/ScheduleSelector'
import { CourseSelectionService } from '../../services/CourseSelectionService'
import { ConflictDetector } from '../../core/ConflictDetector'
import { ModalService } from '../../services/ModalService'
import { DepartmentController } from './DepartmentController'
import { CourseController } from './CourseController'
import { ScheduleController } from './ScheduleController'
import { SectionInfoModalController } from './SectionInfoModalController'
import { InfoModalController } from './InfoModalController'
import { FilterModalController } from './FilterModalController'
import { ScheduleFilterModalController } from './ScheduleFilterModalController'
import { FilterService } from '../../services/FilterService'
import { ScheduleFilterService } from '../../services/ScheduleFilterService'
import { SearchService } from '../../services/searchService'
import { createDefaultFilters, SearchTextFilter } from '../../core/filters'
import { UIStateManager } from './UIStateManager'
import { TimestampManager } from './TimestampManager'
import { OperationManager, DebouncedOperation } from '../../utils/RequestCancellation'
import { DepartmentSyncService } from '../../services/DepartmentSyncService'
import { ScheduleManagementService } from '../../services/ScheduleManagementService'
import { ProfileStateManager } from '../../core/ProfileStateManager'
import { StorageService } from '../../services/StorageService'
import { ThemeManager } from '../../themes/ThemeManager'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MainController - Application Orchestrator & Dependency Injection Container
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ARCHITECTURE ROLE:
 * - Central application coordinator and dependency injection container
 * - Service initialization orchestrator with shared instance management
 * - System integration hub connecting all major architectural layers
 * - Event wiring coordinator establishing inter-service communication
 * - Application lifecycle manager (initialization → operation → cleanup)
 * 
 * MAJOR DEPENDENCIES (25+ services):
 * Core Systems:
 * - ProfileStateManager → Shared state management (injected to all services)
 * - StorageService → Unified storage interface (wraps ProfileStateManager)
 * - ThemeManager → Theme system coordination via storage injection
 * 
 * Data Services:
 * - CourseDataService → WPI course data fetching and caching
 * - CourseSelectionService → Course selection with shared ProfileStateManager
 * - ScheduleManagementService → Schedule operations with shared state
 * 
 * UI Controllers:
 * - DepartmentController, CourseController, ScheduleController → Specialized UI management
 * - Modal Controllers (5x) → Popup content management with shared ModalService
 * 
 * Filter & Search:
 * - FilterService, ScheduleFilterService → Advanced filtering capabilities
 * - SearchService → Course search across all data
 * - DepartmentSyncService → Department/filter synchronization
 * 
 * Utility Services:
 * - UIStateManager, TimestampManager → State and time management
 * - OperationManager → Request debouncing and cancellation
 * - ConflictDetector → Schedule conflict resolution
 * 
 * USED BY:
 * - Application Entry Point (main.ts) → Single initialization call
 * - All UI Components → Access shared services via MainController
 * - Event Handlers → Central coordination through MainController methods
 * 
 * INITIALIZATION FLOW (Critical Order):
 * 1. Core Storage Setup:
 *    - Create ProfileStateManager instance
 *    - Initialize StorageService with shared ProfileStateManager
 *    - Configure ThemeManager to use StorageService (unified storage)
 * 
 * 2. Service Layer Initialization:
 *    - CourseSelectionService with shared ProfileStateManager
 *    - ScheduleManagementService with shared ProfileStateManager + CourseSelectionService
 *    - Filter services with SearchService coordination
 * 
 * 3. UI Controller Setup:
 *    - Department, Course, Schedule controllers with service injection
 *    - Modal controllers with shared ModalService
 *    - UI state managers and utility services
 * 
 * 4. Service Wiring:
 *    - Cross-service dependencies (FilterService ↔ CourseController)
 *    - Event listener setup (CourseSelection changes → UI updates)
 *    - Synchronization services (DepartmentSync ↔ FilterService)
 * 
 * 5. Application Startup:
 *    - StorageService initialization
 *    - CourseSelectionService data loading
 *    - Course data fetching
 *    - UI rendering and event binding
 * 
 * DATA FLOW COORDINATION:
 * Storage Unification:
 * ProfileStateManager → StorageService → ThemeManager (via ThemeStorage interface)
 * All services share the same ProfileStateManager instance for consistency
 * 
 * UI Update Flow:
 * User Interaction → Controller → Service → ProfileStateManager → Event → UI Update
 * MainController ensures all event handlers are properly wired
 * 
 * KEY FEATURES:
 * - Shared instance management (ProfileStateManager across all services)
 * - Unified storage coordination (ThemeManager integration)
 * - Service dependency injection and wiring
 * - Event system coordination (listeners, handlers, cross-service communication)
 * - Application lifecycle management (startup, operation, error handling)
 * - Performance optimization (debounced operations, request cancellation)
 * 
 * INTEGRATION POINTS:
 * - Creates and manages all singleton service instances
 * - Establishes ProfileStateManager as single source of truth
 * - Coordinates ThemeManager storage strategy injection
 * - Wires all cross-service dependencies and event handlers
 * - Provides public API for accessing shared services
 * 
 * ARCHITECTURAL PATTERNS:
 * - Dependency Injection Container: Manages service lifecycle and injection
 * - Orchestrator: Coordinates initialization and operation of all subsystems
 * - Facade: Provides simplified interface to complex service ecosystem
 * - Event Coordinator: Manages event flow between decoupled components
 * - Service Locator: Centralized access point for shared services
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export class MainController {
    private courseDataService: CourseDataService;
    private themeSelector: ThemeSelector;
    private scheduleSelector: ScheduleSelector | null = null;
    private profileStateManager: ProfileStateManager;
    private storageService: StorageService;
    private courseSelectionService: CourseSelectionService;
    private conflictDetector: ConflictDetector;
    private modalService: ModalService;
    private departmentController: DepartmentController;
    private courseController: CourseController;
    private scheduleController: ScheduleController;
    private sectionInfoModalController: SectionInfoModalController;
    private infoModalController: InfoModalController;
    private filterModalController: FilterModalController;
    private scheduleFilterModalController: ScheduleFilterModalController;
    private searchService: SearchService;
    private filterService: FilterService;
    private scheduleFilterService: ScheduleFilterService;
    private uiStateManager: UIStateManager;
    private timestampManager: TimestampManager;
    private operationManager: OperationManager;
    private debouncedSearch: DebouncedOperation;
    private departmentSyncService: DepartmentSyncService;
    private scheduleManagementService: ScheduleManagementService;
    private allDepartments: Department[] = [];


    constructor() {
        // Initialize core storage and state management first
        this.profileStateManager = new ProfileStateManager();
        this.storageService = StorageService.getInstance(this.profileStateManager);
        
        // Connect ThemeManager to use our unified storage
        const themeManager = ThemeManager.getInstance();
        themeManager.setStorage(this.storageService);
        
        // Initialize services with shared ProfileStateManager
        this.courseDataService = new CourseDataService();
        this.themeSelector = new ThemeSelector();
        this.courseSelectionService = new CourseSelectionService(this.profileStateManager);
        this.conflictDetector = new ConflictDetector();
        this.modalService = new ModalService();
        this.departmentController = new DepartmentController();
        
        // Initialize search and filter services
        this.searchService = new SearchService();
        this.filterService = new FilterService(this.searchService);
        this.scheduleFilterService = new ScheduleFilterService(this.searchService);
        
        // Initialize schedule management service with shared ProfileStateManager and CourseSelectionService
        this.scheduleManagementService = new ScheduleManagementService(this.profileStateManager, this.courseSelectionService);
        
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
        this.scheduleFilterModalController = new ScheduleFilterModalController(this.modalService);
        
        // Connect filter service to course controller
        this.courseController.setFilterService(this.filterService);
        
        // Connect filter service and course data to filter modal
        this.filterModalController.setFilterService(this.filterService);
        
        // Connect schedule filter service to controllers
        this.scheduleFilterModalController.setScheduleFilterService(this.scheduleFilterService);
        this.scheduleController.setConflictDetector(this.conflictDetector);
        this.scheduleController.setScheduleFilterService(this.scheduleFilterService);
        this.scheduleController.setScheduleFilterModalController(this.scheduleFilterModalController);
        this.scheduleController.setScheduleManagementService(this.scheduleManagementService);
        
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
        
        // Initialize filter button state
        setTimeout(() => this.updateFilterButtonState(), 100);
    }

    private async init(): Promise<void> {
        this.uiStateManager.showLoadingState();
        
        try {
            // Initialize StorageService FIRST
            console.log('🔄 MainController: Initializing StorageService...');
            const storageInitResult = await this.storageService.initialize();
            console.log('📊 StorageService initialized:', storageInitResult);

            // Initialize CourseSelectionService SECOND to load persisted data
            console.log('🔄 MainController: Initializing CourseSelectionService...');
            const initResult = await this.courseSelectionService.initialize();
            console.log('📊 CourseSelectionService initialized:', initResult);
            
            // Check what was loaded from storage
            const loadedCourses = this.courseSelectionService.getSelectedCourses();
            console.log(`📦 Loaded ${loadedCourses.length} selected courses from storage:`, loadedCourses.map(sc => ({
                course: `${sc.course.department.abbreviation}${sc.course.number}`,
                selectedSection: sc.selectedSectionNumber,
                hasSection: sc.selectedSection !== null
            })));
            
            await this.loadCourseData();
            this.departmentController.displayDepartments();
            
            // Initialize the department sync service AFTER departments are rendered
            this.departmentSyncService.initialize();
            
            // Set "All Departments" as the default selection on startup
            this.initializeDefaultDepartmentView();
            
            this.setupEventListeners();
            this.setupCourseSelectionListener();
            this.setupSaveStateListener();
            this.courseController.displaySelectedCourses();
            
            // Load saved filters AFTER all services are fully connected and ready
            this.filterService.loadFiltersFromStorage();
            
            this.uiStateManager.syncHeaderHeights();
            this.uiStateManager.setupHeaderResizeObserver();
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.uiStateManager.showErrorMessage('Failed to initialize application. Some features may not work properly.');
        }
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
            
            // IMPORTANT: Reconstruct Section objects after course data is loaded
            // This must happen after course data is loaded but service is already initialized
            this.courseSelectionService.reconstructSectionObjects();
            
            // Initialize default schedule if needed (await to ensure it completes)
            await this.scheduleManagementService.initializeDefaultScheduleIfNeeded();
            
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
                
                (window as any).debugScheduleManagement = {
                    debug: () => this.scheduleManagementService.debugState(),
                    getService: () => this.scheduleManagementService,
                    createSchedule: (name: string) => this.scheduleManagementService.createNewSchedule(name),
                    switchSchedule: (id: string) => this.scheduleManagementService.setActiveSchedule(id),
                    getSchedules: () => this.scheduleManagementService.getAllSchedules(),
                    getCurrentPage: () => this.uiStateManager.currentPage,
                    createTestSchedules: async () => {
                        const schedule1 = await this.scheduleManagementService.createNewSchedule('Test Schedule 1');
                        const schedule2 = await this.scheduleManagementService.createNewSchedule('Test Schedule 2');
                        console.log('Created test schedules:', schedule1.schedule?.id, schedule2.schedule?.id);
                        return { schedule1, schedule2 };
                    },
                    testCompleteSwitch: (scheduleId?: string) => {
                        const schedules = this.scheduleManagementService.getAllSchedules();
                        if (schedules.length < 2 && !scheduleId) {
                            const { schedule1, schedule2 } = (window as any).debugScheduleManagement.createTestSchedules();
                            scheduleId = schedule1.id;
                        }
                        const targetId = scheduleId || schedules[0].id;
                        console.log('Testing complete schedule switch to:', targetId);
                        this.scheduleManagementService.setActiveSchedule(targetId);
                    }
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
                    // Make async call and handle potential errors
                    this.courseController.toggleCourseSelection(courseElement).catch(error => {
                        console.error('Failed to toggle course selection:', error);
                        this.uiStateManager.showErrorMessage('Failed to update course selection. Please try again.');
                    });
                }
            }

            if (target.classList.contains('load-more-button')) {
                // Handle Load More button click
                this.handleLoadMoreClick().catch(error => {
                    console.error('Failed to load more courses:', error);
                    this.uiStateManager.showErrorMessage('Failed to load more courses. Please try again.');
                });
                return;
            }

            if (target.classList.contains('course-remove-btn')) {
                // Determine which page we're on and use the appropriate controller
                let course;
                if (this.uiStateManager.currentPage === 'schedule') {
                    course = this.scheduleController.getCourseFromElement(target as HTMLElement);
                } else {
                    course = this.courseController.getCourseFromElement(target as HTMLElement);
                }
                
                if (course) {
                    // Directly remove course (remove button means always unselect)
                    this.courseSelectionService.unselectCourse(course).catch(error => {
                        console.error('Failed to unselect course:', error);
                        this.uiStateManager.showErrorMessage('Failed to remove course. Please try again.');
                    });
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
                        this.scheduleController.handleSectionSelection(course, sectionNumber).catch(error => {
                            console.error('Failed to handle section selection:', error);
                            this.uiStateManager.showErrorMessage('Failed to update section selection. Please try again.');
                        });
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
            scheduleButton.addEventListener('click', async () => {
                this.uiStateManager.togglePage();
                if (this.uiStateManager.currentPage === 'schedule') {
                    // Initialize schedule selector if not already created
                    if (!this.scheduleSelector) {
                        try {
                            // Ensure the schedule management service is initialized before creating selector
                            await this.scheduleManagementService.initialize();
                            
                            this.scheduleSelector = new ScheduleSelector(this.scheduleManagementService, 'schedule-selector-container');
                        } catch (error) {
                            console.error('Failed to initialize schedule selector:', error);
                        }
                    }
                    
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

        // Schedule filter button
        const scheduleFilterButton = document.getElementById('schedule-filter-btn');
        if (scheduleFilterButton) {
            scheduleFilterButton.addEventListener('click', () => {
                const selectedCourses = this.courseSelectionService.getSelectedCourses();
                this.scheduleFilterModalController.setSelectedCourses(selectedCourses);
                this.scheduleFilterModalController.show();
            });
        }

        // Schedule search functionality
        const scheduleSearchInput = document.getElementById('schedule-search-input') as HTMLInputElement;
        if (scheduleSearchInput) {
            scheduleSearchInput.addEventListener('input', () => {
                const query = scheduleSearchInput.value.trim();
                
                if (query.length > 0) {
                    this.scheduleFilterService.addFilter('searchText', { query });
                } else {
                    this.scheduleFilterService.removeFilter('searchText');
                }
                
                // Refresh the schedule page display
                this.scheduleController.applyFiltersAndRefresh();
            });
        }

        // Save profile button
        const saveProfileButton = document.getElementById('save-profile-btn');
        if (saveProfileButton) {
            saveProfileButton.addEventListener('click', () => {
                this.handleSaveProfile();
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
            // No filters, no department selected - show all courses ("All Departments" view)
            coursesToDisplay = this.getAllCourses();
            this.updateAllDepartmentsHeader();
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

        // Clear search and filters
        const searchInput = document.getElementById('search-input') as HTMLInputElement;
        if (searchInput) {
            searchInput.value = '';
        }
        this.filterService.removeFilter('searchText');

        // Clear department selection (this will activate "All Departments")
        this.departmentController.clearDepartmentSelection();
        
        // Reset to "All Departments" state 
        this.refreshCurrentView(); // This will now show all courses since no department/filters are selected

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

    public getScheduleManagementService(): ScheduleManagementService {
        return this.scheduleManagementService;
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

    private updateAllDepartmentsHeader(): void {
        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            const totalCourses = this.getAllCourses().length;
            contentHeader.textContent = `All Departments (${totalCourses} courses)`;
        }
    }

    private initializeDefaultDepartmentView(): void {
        // Make sure "All Departments" is visually selected (it already has 'active' class from displayDepartments)
        // and show all courses by triggering a refresh
        this.refreshCurrentView();
    }

    private async handleLoadMoreClick(): Promise<void> {
        // Show loading state on the button
        const loadMoreButton = document.querySelector('.load-more-button') as HTMLButtonElement;
        if (!loadMoreButton) return;
        
        const originalText = loadMoreButton.textContent;
        loadMoreButton.textContent = 'Loading...';
        loadMoreButton.disabled = true;
        
        try {
            // Load more courses using the current view
            const currentView = this.uiStateManager.currentView;
            await this.courseController.displayMoreCourses(currentView);
        } catch (error) {
            console.error('Error loading more courses:', error);
            // Restore button state on error
            loadMoreButton.textContent = originalText;
            loadMoreButton.disabled = false;
            throw error; // Re-throw so the caller can handle it
        }
    }

    private async handleSaveProfile(): Promise<void> {
        const saveButton = document.getElementById('save-profile-btn') as HTMLButtonElement;
        if (!saveButton) return;

        // Visual feedback
        const originalText = saveButton.innerHTML;
        saveButton.innerHTML = '⏳ Saving...';
        saveButton.disabled = true;

        const result = await this.scheduleManagementService.manualSaveCurrentProfile();
        const success = result.success;
        
        setTimeout(() => {
            if (success) {
                saveButton.innerHTML = '✅ Saved!';
                setTimeout(() => {
                    saveButton.innerHTML = originalText;
                    saveButton.disabled = false;
                }, 1500);
            } else {
                saveButton.innerHTML = '❌ Error';
                setTimeout(() => {
                    saveButton.innerHTML = originalText;
                    saveButton.disabled = false;
                }, 2000);
            }
        }, 300);
    }

    private setupSaveStateListener(): void {
        this.scheduleManagementService.onSaveStateChange((hasUnsavedChanges) => {
            this.updateSaveButtonState(hasUnsavedChanges);
        });
    }

    private updateSaveButtonState(hasUnsavedChanges: boolean): void {
        const saveButton = document.getElementById('save-profile-btn') as HTMLButtonElement;
        if (!saveButton) return;

        if (hasUnsavedChanges) {
            saveButton.classList.add('unsaved-changes');
            saveButton.title = 'You have unsaved changes - Click to save';
            if (!saveButton.innerHTML.includes('*')) {
                saveButton.innerHTML = saveButton.innerHTML.replace('💾 Save', '💾 Save*');
            }
        } else {
            saveButton.classList.remove('unsaved-changes');
            saveButton.title = 'Save current profile';
            saveButton.innerHTML = saveButton.innerHTML.replace('💾 Save*', '💾 Save');
        }
    }

}