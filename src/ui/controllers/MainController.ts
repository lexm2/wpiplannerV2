import { Course, Department } from '../../types/types'
import { SelectedCourse } from '../../types/schedule'
import { CourseDataService } from '../../services/courseDataService'
import { ThemeSelector } from '../components/ThemeSelector'
import { SchedulePickerModal } from '../components/SchedulePickerModal'
import { CourseSelectionService } from '../../services/CourseSelectionService'
import { ConflictDetector } from '../../core/ConflictDetector'
import { getAllSections } from '../../utils/courseUtils'
import { ModalService } from '../../services/ModalService'
import { DepartmentController } from './DepartmentController'
import { CourseController } from './CourseController'
import { ScheduleController } from './ScheduleController'
import { SectionInfoModalController } from './SectionInfoModalController'
import { InfoModalController } from './InfoModalController'
import { FilterModalController } from './FilterModalController'
import { ScheduleFilterModalController } from './ScheduleFilterModalController'
import { CourseFilterService } from '../../services/CourseFilterService'
import { ScheduleFilterService } from '../../services/ScheduleFilterService'
import { SearchService } from '../../services/searchService'
import { createDefaultFilters, SearchTextFilter } from '../../core/filters'
import { rateMyProfessorService } from '../../services/RateMyProfessorService'
import { UIStateManager } from './UIStateManager'
import { TimestampManager } from './TimestampManager'
import { OperationManager, DebouncedOperation } from '../../utils/RequestCancellation'
import { DepartmentSyncService } from '../../services/DepartmentSyncService'
import { ScheduleManagementService } from '../../services/ScheduleManagementService'
import { ProfileStateManager } from '../../core/ProfileStateManager'
import { StorageService } from '../../services/StorageService'
import { ThemeManager } from '../../themes/ThemeManager'
import { DataUpdateService } from '../../services/DataUpdateService'
import type { DataUpdateAvailableEvent } from '../../types/worker'
import { getInlineSVG } from '../../utils/iconPaths'
import { OneDriveSignIn } from '../components/OneDriveSignIn'
import { ConflictResolutionModal } from '../components/ConflictResolutionModal'
import { OneDriveSyncService } from '../../services/OneDriveSyncService'
import type { SyncEvent, ConflictData, CloudStateData } from '../../services/OneDriveSyncTypes'

/**
 * Application orchestrator managing service initialization, dependency injection, and event coordination
 */
export class MainController {
    private courseDataService: CourseDataService;
    private schedulePickerModal: SchedulePickerModal | null = null;
    private _themeSelector: ThemeSelector;
    private themeManager: ThemeManager;
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
    private filterService: CourseFilterService;
    private scheduleFilterService: ScheduleFilterService;
    private uiStateManager: UIStateManager;
    private timestampManager: TimestampManager;
    private operationManager: OperationManager;
    private debouncedSearch: DebouncedOperation;
    private departmentSyncService: DepartmentSyncService;
    private scheduleManagementService: ScheduleManagementService;
    private dataUpdateService: DataUpdateService;
    private oneDriveSignIn: OneDriveSignIn;
    private conflictModal: ConflictResolutionModal;
    private oneDriveSyncService: OneDriveSyncService;
    private allDepartments: Department[] = [];


    constructor() {
        // Initialize core storage and state management first
        this.profileStateManager = new ProfileStateManager();
        this.storageService = StorageService.getInstance(this.profileStateManager);
        
        // Connect ThemeManager to use our unified storage
        this.themeManager = ThemeManager.getInstance();
        this.themeManager.setStorage(this.storageService);
        
        // Initialize services with shared ProfileStateManager
        this.courseDataService = new CourseDataService();
        this._themeSelector = new ThemeSelector(this.profileStateManager);
        this.courseSelectionService = new CourseSelectionService(this.profileStateManager);
        this.conflictDetector = new ConflictDetector();
        this.modalService = new ModalService();
        this.departmentController = new DepartmentController();
        
        // Initialize search and filter services
        this.searchService = new SearchService();
        this.filterService = new CourseFilterService(this.searchService);
        this.scheduleFilterService = new ScheduleFilterService(rateMyProfessorService);
        
        // Initialize schedule management service with shared ProfileStateManager and CourseSelectionService
        this.scheduleManagementService = new ScheduleManagementService(this.profileStateManager, this.courseSelectionService);
        
        // Initialize managers (before any event listeners that might use them)
        this.uiStateManager = new UIStateManager();
        this.timestampManager = new TimestampManager();
        this.operationManager = new OperationManager();
        this.debouncedSearch = new DebouncedOperation(this.operationManager, 'search', 300);

        // Initialize data update service
        this.dataUpdateService = new DataUpdateService();

        // Initialize OneDrive sync components
        this.oneDriveSignIn = new OneDriveSignIn();
        this.conflictModal = new ConflictResolutionModal();
        this.oneDriveSyncService = OneDriveSyncService.getInstance();

        // Initialize controllers
        this.courseController = new CourseController(this.courseSelectionService, this.courseDataService);
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
        this.scheduleController.setCourseDataService(this.courseDataService);
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
        const filters = createDefaultFilters(rateMyProfessorService);
        filters.forEach(filter => {
            this.filterService.registerFilter(filter);
        });

        // Register SearchTextFilter
        const searchTextFilter = new SearchTextFilter();
        this.filterService.registerFilter(searchTextFilter);

        // Set up filter change listener to refresh UI
        this.filterService.addEventListener((_event) => {
            this.refreshCurrentView();
        });

        // Set up schedule filter change listener
        this.scheduleFilterService.addEventListener((_event) => {
            this.scheduleController.applyFiltersAndRefresh();
        });

        // Initialize filter button states
        setTimeout(() => {
            this.updateFilterButtonState();
            this.updateScheduleFilterButtonState();
        }, 100);
    }

    private async init(): Promise<void> {
        this.uiStateManager.showLoadingState();

        try {
            // Clear legacy localStorage schedule data (now using IndexedDB)
            this.clearLegacyLocalStorage();

            // Initialize StorageService and load persisted data
            await this.storageService.initialize();
            this._themeSelector.initializeTheme();
            await rateMyProfessorService.loadData();
            await this.courseSelectionService.initialize();
            await this.scheduleManagementService.initialize();
            
            await this.loadCourseData();
            this.departmentController.displayDepartments();
            
            // Initialize the department sync service AFTER departments are rendered
            this.departmentSyncService.initialize();
            
            // Set "All Departments" as the default selection on startup
            this.initializeDefaultDepartmentView();
            
            this.setupEventListeners();
            this.setupSaveIndicatorListener();
            this.setupOneDriveSyncListeners();
            this.oneDriveSignIn.render('onedrive-signin-container');
            this.setupCourseSelectionListener();
            this.setupScheduleChangeListener();
            this.scheduleController.setupAutoScheduleButton();
            this.scheduleController.setupClearAllSectionsButton();
            this.scheduleController.setupCourseSelectionChangeListener();
            this.courseController.displaySelectedCourses();
            
            // Initial UI sync for selected courses (use efficient targeted updates)
            this.syncInitialCourseSelectionUI();
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.uiStateManager.showErrorMessage('Failed to initialize application. Some features may not work properly.');
        }
    }

    /**
     * Clears legacy localStorage keys that contain schedule data.
     * All schedule data now stored in IndexedDB, localStorage only used for small data.
     */
    private clearLegacyLocalStorage(): void {
        const keysToRemove = [
            'wpi-planner-schedules',
            'wpi-planner-user-state'
        ];

        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
        });

        console.log('✅ Cleared legacy localStorage schedule keys');
    }

    private async loadCourseData(): Promise<void> {
        try {
            const scheduleDB = await this.courseDataService.loadCourseData();
            this.allDepartments = scheduleDB.departments;
            this.departmentController.setAllDepartments(this.allDepartments);
            this.courseController.setAllDepartments(this.allDepartments);
            this.courseSelectionService.setAllDepartments(this.allDepartments);

            // Set course catalog in ProfileStateManager for section reference resolution
            this.profileStateManager.setCourseData(this.allDepartments);

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
            const serverTimestamp = await this.timestampManager.loadServerTimestamp();

            // Initialize data update service (worker will start when tab becomes unfocused)
            if (serverTimestamp) {
                this.dataUpdateService.updateLastLoadedTimestamp(serverTimestamp);
            }
            this.setupDataUpdateListener();
            
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
                            const { schedule1 } = (window as any).debugScheduleManagement.createTestSchedules();
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

            if (target.classList.contains('course-clear-sections-btn') || target.closest('.course-clear-sections-btn')) {
                e.stopPropagation();

                const button = target.classList.contains('course-clear-sections-btn')
                    ? target
                    : target.closest('.course-clear-sections-btn') as HTMLElement;

                let course;
                if (this.uiStateManager.currentPage === 'schedule') {
                    course = this.scheduleController.getCourseFromElement(button);
                } else {
                    course = this.courseController.getCourseFromElement(button);
                }

                if (course) {
                    this.courseSelectionService.clearCourseComponents(course).catch(error => {
                        console.error('Failed to clear course components:', error);
                        this.uiStateManager.showErrorMessage('Failed to clear sections. Please try again.');
                    });
                }
                return;
            }

            // Handle clicking on schedule course header to open wizard
            if (target.classList.contains('schedule-course-header') || target.closest('.schedule-course-header')) {
                e.stopPropagation();

                if (this.uiStateManager.currentPage === 'schedule') {
                    // Don't trigger if clicking remove button
                    if (target.classList.contains('course-remove-btn')) {
                        return;
                    }

                    const headerElement = target.classList.contains('schedule-course-header')
                        ? target
                        : target.closest('.schedule-course-header') as HTMLElement;

                    if (headerElement) {
                        const courseElement = headerElement.closest('.schedule-course-item') as HTMLElement;
                        if (courseElement) {
                            const course = this.scheduleController.getCourseFromElement(courseElement);
                            if (course) {
                                // Get existing selections for this course
                                const selectedCourses = this.courseSelectionService.getSelectedCourses();
                                const existingSelections = selectedCourses.find(sc => sc.course.id === course.id);

                                // Log without circular reference
                                if (existingSelections) {
                                    console.log('Selected Course Data:', {
                                        isRequired: existingSelections.isRequired,
                                        selectedSectionNumber: existingSelections.selectedSectionNumber,
                                        selectedLecture: existingSelections.selectedLecture?.number || null,
                                        selectedDiscussion: existingSelections.selectedDiscussion?.number || null,
                                        selectedLab: existingSelections.selectedLab?.number || null,
                                        course: {
                                            id: course.id,
                                            number: course.number,
                                            name: course.name,
                                            department: course.department?.abbreviation,
                                            hasLectures: !!course.lectures && course.lectures.length > 0,
                                            lecturesCount: course.lectures?.length || 0,
                                            hasStandaloneLabs: !!course.standaloneLabs && course.standaloneLabs.length > 0,
                                            standaloneLabs: course.standaloneLabs?.length || 0,
                                            sectionsCount: getAllSections(course).length
                                        }
                                    });
                                }

                                // Open wizard with existing selections if any
                                this.scheduleController.openComponentWizard(course, existingSelections);
                            }
                        }
                    }
                }
                return;
            }


            if (target.closest('.course-item, .course-card, .selected-course-item') && !target.classList.contains('course-select-btn') && !target.classList.contains('section-badge') && !target.classList.contains('course-remove-btn')) {
                const courseElement = target.closest('.course-item, .course-card, .selected-course-item') as HTMLElement;
                if (courseElement) {
                    this.courseController.selectCourse(courseElement);
                }
            }
        });

        // Search functionality with debouncing and cancellation
        const searchInput = document.getElementById('search-input') as HTMLInputElement;
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const query = searchInput.value;

                // Use debounced operation for search to prevent excessive filtering
                this.debouncedSearch.execute(async (cancellationToken) => {
                    cancellationToken.throwIfCancelled();

                    // Update search text filter in FilterService
                    // Only trim for the check, but pass the original query with spaces
                    if (query.trim().length > 0) {
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

        // Schedule picker button
        const schedulePickerBtn = document.getElementById('schedule-picker-btn');
        if (schedulePickerBtn) {
            schedulePickerBtn.addEventListener('click', () => {
                this.openSchedulePicker();
            });
        }

        // Tab navigation
        const plannerTab = document.getElementById('planner-tab');
        const scheduleTab = document.getElementById('schedule-tab');

        if (plannerTab) {
            plannerTab.addEventListener('click', () => {
                // Close wizard when switching to planner/classes page
                this.scheduleController.closeComponentWizard();
                this.uiStateManager.switchToPage('planner');
            });
        }

        if (scheduleTab) {
            scheduleTab.addEventListener('click', async () => {
                this.uiStateManager.switchToPage('schedule');

                // Log selected section data for debugging
                const selectedCourses = this.courseSelectionService.getSelectedCourses();
                console.log('=== SCHEDULE PAGE LOADED ===');
                console.log(`Found ${selectedCourses.length} selected courses with sections:`);

                selectedCourses.forEach(sc => {
                    const hasSection = sc.selectedSection !== null;
                    console.log(`${sc.course.department.abbreviation}${sc.course.number}: section ${sc.selectedSectionNumber} ${hasSection ? 'OK' : 'MISSING'}`);
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
            filterButton.insertAdjacentHTML('afterbegin', getInlineSVG('FILTER_FILLED', 'filter-icon'));
            filterButton.addEventListener('click', () => {
                this.filterModalController.show();
            });
        }

        // Clear filters button
        const clearFiltersButton = document.getElementById('clear-filters-btn');
        if (clearFiltersButton) {
            clearFiltersButton.insertAdjacentHTML('afterbegin', getInlineSVG('ERASER', 'eraser-icon'));
            clearFiltersButton.addEventListener('click', () => {
                if (this.filterService) {
                    this.filterService.clearFilters();
                    this.updateFilterButtonState();
                    this.updateClearFiltersButtonState();
                }
            });
        }

        // Schedule filter button
        const scheduleFilterButton = document.getElementById('schedule-filter-btn');
        if (scheduleFilterButton) {
            scheduleFilterButton.insertAdjacentHTML('afterbegin', getInlineSVG('FILTER_FILLED', 'filter-icon'));
            scheduleFilterButton.addEventListener('click', () => {
                const selectedCourses = this.courseSelectionService.getSelectedCourses();
                this.scheduleFilterModalController.setSelectedCourses(selectedCourses);
                this.scheduleFilterModalController.show();
            });
        }

        // Schedule clear filters button
        const scheduleClearFiltersButton = document.getElementById('schedule-clear-filters-btn');
        if (scheduleClearFiltersButton) {
            scheduleClearFiltersButton.insertAdjacentHTML('afterbegin', getInlineSVG('ERASER', 'eraser-icon'));
            scheduleClearFiltersButton.addEventListener('click', () => {
                if (this.scheduleFilterService) {
                    this.scheduleFilterService.clearFilters();
                    this.updateScheduleFilterButtonState();
                    this.updateScheduleClearFiltersButtonState();
                }
            });
        }

        // Schedule search functionality
        const scheduleSearchInput = document.getElementById('schedule-search-input') as HTMLInputElement;
        if (scheduleSearchInput) {
            scheduleSearchInput.addEventListener('input', () => {
                const query = scheduleSearchInput.value;

                if (query.trim().length > 0) {
                    this.scheduleFilterService.addFilter('searchText', { query });
                } else {
                    this.scheduleFilterService.removeFilter('searchText');
                }

                // Refresh the schedule page display
                this.scheduleController.applyFiltersAndRefresh();
            });
        }

        // Undo/Redo button event listeners
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');

        if (undoBtn) {
            undoBtn.insertAdjacentHTML('afterbegin', getInlineSVG('ARROW_BACK_UP'));
            undoBtn.addEventListener('click', () => {
                this.handleUndo();
            });
        }

        if (redoBtn) {
            redoBtn.insertAdjacentHTML('afterbegin', getInlineSVG('ARROW_FORWARD_UP'));
            redoBtn.addEventListener('click', () => {
                this.handleRedo();
            });
        }

        // Mobile menu hamburger button
        this.setupMobileMenu();

        // Schedule page mobile menu
        this.setupScheduleMobileMenu();

        // Settings menu for mobile
        this.setupSettingsMenu();

        // Keyboard shortcuts for undo/redo
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.handleUndo();
            } else if (e.ctrlKey && e.key === 'y') {
                e.preventDefault();
                this.handleRedo();
            }
        });

        // Listen to undo/redo state changes to update button states
        this.profileStateManager.onUndoRedoChange(() => {
            this.updateUndoRedoButtons();
        });

        // Initial button state update
        this.updateUndoRedoButtons();
    }

    private refreshCurrentView(): void {
        const hasFilters = !this.filterService.isEmpty();

        // Check if department filter is active
        const departmentFilter = this.filterService.getActiveFilters()
            .find(f => f.id === 'department');
        const departmentCriteria = departmentFilter?.criteria as { departments?: string[] } | undefined;
        const activeDepartmentIds = departmentCriteria?.departments || [];

        // Start a new render operation with cancellation support
        const cancellationToken = this.operationManager.startOperation('render', 'New render requested');

        let coursesToDisplay: Course[] = [];

        if (hasFilters) {
            // Get base courses - if single department filter, use that department's courses
            let baseCourses: Course[];
            if (activeDepartmentIds.length === 1) {
                const dept = this.departmentController.getDepartmentById(activeDepartmentIds[0]);
                baseCourses = dept ? dept.courses : this.getAllCourses();
            } else {
                baseCourses = this.getAllCourses();
            }

            coursesToDisplay = this.filterService.filterCourses(baseCourses);

            // Update header based on filter state
            if (activeDepartmentIds.length === 1 && this.filterService.getActiveFilters().length === 1) {
                // Single department filter only
                const dept = this.departmentController.getDepartmentById(activeDepartmentIds[0]);
                if (dept) {
                    this.updateDepartmentHeader(dept);
                } else {
                    this.updateFilteredHeader(coursesToDisplay.length, null);
                }
            } else {
                // Multiple filters or multiple departments
                this.updateFilteredHeader(coursesToDisplay.length, null);
            }
        } else {
            // No filters - show all courses
            coursesToDisplay = this.getAllCourses();
            this.updateAllDepartmentsHeader();
        }

        // Display courses with cancellation support
        this.displayCoursesWithCancellation(coursesToDisplay, cancellationToken);

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
            if ((error as Error).name === 'CancellationError') {
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
        this.updateClearFiltersButtonState();
    }

    private updateClearFiltersButtonState(): void {
        const clearFiltersButton = document.getElementById('clear-filters-btn') as HTMLButtonElement | null;
        if (clearFiltersButton && this.filterService) {
            const hasActiveFilters = !this.filterService.isEmpty();

            if (hasActiveFilters) {
                clearFiltersButton.style.display = '';
                clearFiltersButton.disabled = false;
            } else {
                clearFiltersButton.style.display = 'none';
            }
        }
    }

    private updateScheduleFilterButtonState(): void {
        const scheduleFilterButton = document.getElementById('schedule-filter-btn');
        if (scheduleFilterButton && this.scheduleFilterService) {
            const hasActiveFilters = !this.scheduleFilterService.isEmpty();
            const filterCount = this.scheduleFilterService.getFilterCount();

            if (hasActiveFilters) {
                scheduleFilterButton.classList.add('active');
                scheduleFilterButton.title = `${filterCount} filter${filterCount === 1 ? '' : 's'} active - Click to modify`;
            } else {
                scheduleFilterButton.classList.remove('active');
                scheduleFilterButton.title = 'Filter selected courses';
            }
        }
        this.updateScheduleClearFiltersButtonState();
    }

    private updateScheduleClearFiltersButtonState(): void {
        const scheduleClearFiltersButton = document.getElementById('schedule-clear-filters-btn') as HTMLButtonElement | null;
        if (scheduleClearFiltersButton && this.scheduleFilterService) {
            const hasActiveFilters = !this.scheduleFilterService.isEmpty();

            if (hasActiveFilters) {
                scheduleClearFiltersButton.style.display = '';
                scheduleClearFiltersButton.disabled = false;
            } else {
                scheduleClearFiltersButton.style.display = 'none';
            }
        }
    }

    private openSchedulePicker(): void {
        if (!this.schedulePickerModal) {
            this.schedulePickerModal = new SchedulePickerModal(this.modalService, this.scheduleManagementService);
        }
        this.schedulePickerModal.show();
    }

    private async updateSchedulePickerButton(): Promise<void> {
        const labelElement = document.getElementById('schedule-picker-label');
        if (labelElement) {
            // Wait for initialization if needed
            await this.scheduleManagementService.initialize();

            const activeSchedule = this.scheduleManagementService.getActiveSchedule();
            if (activeSchedule) {
                labelElement.textContent = activeSchedule.name;
            }
        }
    }


    private previousSelectedCoursesCount = 0;
    private previousSelectedCoursesMap = new Map<string, string | null>();

    private setupSaveIndicatorListener(): void {
        // Listen for save state changes from ProfileStateManager
        this.profileStateManager.addListener((event) => {
            if (event.type === 'save_state_changed') {
                this.updateSaveIndicator(event.data.hasUnsavedChanges);
            }
        });
    }

    private setupOneDriveSyncListeners(): void {
        this.oneDriveSyncService.addEventListener((event: SyncEvent) => {
            this.handleSyncEvent(event);
        });
    }

    private handleSyncEvent(event: SyncEvent): void {
        const indicator = document.getElementById('optimistic-ui-status');
        if (!indicator) return;

        switch (event.type) {
            case 'sync-started':
                indicator.textContent = 'Syncing to cloud...';
                indicator.className = 'optimistic-status syncing';
                break;
            case 'sync-completed':
                indicator.textContent = 'Synced to cloud';
                indicator.className = 'optimistic-status synced';
                setTimeout(() => {
                    indicator.textContent = 'No changes';
                    indicator.className = 'optimistic-status idle';
                }, 1500);
                break;
            case 'sync-failed':
                indicator.textContent = 'Sync error';
                indicator.className = 'optimistic-status error';
                setTimeout(() => {
                    indicator.textContent = 'No changes';
                    indicator.className = 'optimistic-status idle';
                }, 3000);
                break;
            case 'sync-conflict':
                indicator.textContent = 'Sync conflict';
                indicator.className = 'optimistic-status conflict';
                this.handleSyncConflict(event.data as ConflictData);
                break;
            case 'offline-mode':
                indicator.textContent = 'Offline mode';
                indicator.className = 'optimistic-status offline';
                break;
            case 'online-mode':
                indicator.textContent = 'No changes';
                indicator.className = 'optimistic-status idle';
                break;
        }
    }

    private handleSyncConflict(conflictData: ConflictData): void {
        this.conflictModal.show(conflictData, async (resolution) => {
            if (resolution === 'cancel') {
                const indicator = document.getElementById('optimistic-ui-status');
                if (indicator) {
                    indicator.textContent = 'No changes';
                    indicator.className = 'optimistic-status idle';
                }
                return;
            }

            const result = await this.oneDriveSyncService.resolveConflict(
                resolution,
                conflictData.local,
                conflictData.cloud
            );

            if (result.success) {
                if (resolution === 'keep-cloud') {
                    await this.profileStateManager.pullFromCloudAndMerge();
                }
            }
        });
    }

    private updateSaveIndicator(hasUnsavedChanges: boolean): void {
        const indicator = document.getElementById('optimistic-ui-status');
        if (!indicator) return;

        if (hasUnsavedChanges) {
            indicator.textContent = 'Saving...';
            indicator.className = 'optimistic-status saving';
        } else {
            indicator.textContent = 'Saved';
            indicator.className = 'optimistic-status saved';

            // Return to "No changes" after 1.5 seconds
            setTimeout(() => {
                indicator.textContent = 'No changes';
                indicator.className = 'optimistic-status idle';
            }, 1500);
        }
    }

    private setupScheduleChangeListener(): void {
        this.scheduleManagementService.onActiveScheduleChange(() => {
            this.updateSchedulePickerButton();
        });
        this.updateSchedulePickerButton();
    }

    private setupCourseSelectionListener(): void {
        this.courseSelectionService.onSelectionChangeWithType((event) => {
            const selectedCourses = event.selectedCourses;
            const currentCount = selectedCourses.length;
            const isCoursesAddedOrRemoved = currentCount !== this.previousSelectedCoursesCount;
            
            // Handle schedule changes and data loads with full refresh
            const requiresFullRefresh = event.type === 'data_loaded'
                || event.type === 'selection_cleared'
                || event.type === 'components_cleared'
                || event.type === 'components_changed';
            if (requiresFullRefresh) {
                this.courseController.refreshCourseSelectionUI(selectedCourses, this.previousSelectedCoursesMap);
                this.courseController.displaySelectedCourses();
                this.scheduleController.displayScheduleSelectedCourses();
                if (this.uiStateManager.currentPage === 'schedule') {
                    this.scheduleController.renderScheduleGrids();
                }
                this.updateSelectedCoursesState(selectedCourses);
                return;
            }
            
            // Create current state map for comparison
            const currentCoursesMap = new Map<string, string | null>();
            selectedCourses.forEach(sc => {
                currentCoursesMap.set(sc.course.id, sc.selectedSectionNumber);
            });
            
            // Use targeted updates instead of global refresh for better performance
            if (isCoursesAddedOrRemoved) {
                this.courseController.refreshCourseSelectionUI(selectedCourses, this.previousSelectedCoursesMap);
            }
            
            // Always update the selected courses sidebar
            this.courseController.displaySelectedCourses();
            
            if (isCoursesAddedOrRemoved) {
                // Full refresh needed when courses are added/removed
                this.scheduleController.displayScheduleSelectedCourses();
                
                // Also refresh schedule grids if we're on the schedule page
                if (this.uiStateManager.currentPage === 'schedule') {
                    this.scheduleController.renderScheduleGrids();
                }
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
            this.updateSelectedCoursesState(selectedCourses);
        });
    }

    private updateSelectedCoursesState(selectedCourses: SelectedCourse[]): void {
        this.previousSelectedCoursesCount = selectedCourses.length;
        this.previousSelectedCoursesMap = new Map<string, string | null>();
        selectedCourses.forEach(sc => {
            this.previousSelectedCoursesMap.set(sc.course.id, sc.selectedSectionNumber);
        });
    }

    private handleUndo(): void {
        this.profileStateManager.undo().then(() => {
            this.refreshUIAfterUndoRedo();
        }).catch(error => {
            console.error('Undo failed:', error);
            this.uiStateManager.showErrorMessage('Failed to undo. Please try again.');
        });
    }

    private handleRedo(): void {
        this.profileStateManager.redo().then(() => {
            this.refreshUIAfterUndoRedo();
        }).catch(error => {
            console.error('Redo failed:', error);
            this.uiStateManager.showErrorMessage('Failed to redo. Please try again.');
        });
    }

    private refreshUIAfterUndoRedo(): void {
        this.courseController.displaySelectedCourses();
        this.scheduleController.displayScheduleSelectedCourses();

        if (this.uiStateManager.currentPage === 'schedule') {
            this.scheduleController.renderScheduleGrids();
        } else {
            this.refreshCurrentView();
        }
    }

    private updateUndoRedoButtons(): void {
        const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
        const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement;

        if (undoBtn) {
            undoBtn.disabled = !this.profileStateManager.canUndo();
        }

        if (redoBtn) {
            redoBtn.disabled = !this.profileStateManager.canRedo();
        }
    }

    private setupDataUpdateListener(): void {
        window.addEventListener('data-update-available', ((event: DataUpdateAvailableEvent) => {
            const indicator = document.getElementById('optimistic-ui-status');
            if (!indicator) return;

            // Check if indicator is hidden (below 1600px breakpoint)
            const isHidden = window.getComputedStyle(indicator).display === 'none';

            if (isHidden) {
                // Auto-refresh if button is hidden
                this.refreshCourseData();
            } else {
                // Show refresh button and wait for user click
                indicator.textContent = 'Refresh';
                indicator.className = 'optimistic-status refresh-available';

                // Remove any existing click listeners to prevent duplicates
                const newIndicator = indicator.cloneNode(true) as HTMLElement;
                indicator.parentNode?.replaceChild(newIndicator, indicator);

                // Add click listener to trigger refresh
                newIndicator.addEventListener('click', () => {
                    this.refreshCourseData();
                });
            }
        }) as EventListener);
    }

    private async refreshCourseData(): Promise<void> {
        window.location.reload();
    }

    /**
     * Efficiently sync UI for initially selected courses without global refresh
     */
    private syncInitialCourseSelectionUI(): void {
        const selectedCourses = this.courseSelectionService.getSelectedCourses();
        
        // Use targeted updates for each selected course
        selectedCourses.forEach(selectedCourse => {
            this.courseController.updateCourseUIById(selectedCourse.course.id, true);
        });
        
        console.log(`Initial UI sync complete: Updated ${selectedCourses.length} selected courses`);
    }


    // Mobile menu management
    private mobileMenuBackdrop: HTMLElement | null = null;
    private mobileMenuOpen: 'sidebar' | 'right-panel' | null = null;

    private setupMobileMenu(): void {
        const menuBtn = document.getElementById('mobile-menu-btn');
        if (!menuBtn) return;

        // Inject hamburger icon
        menuBtn.insertAdjacentHTML('afterbegin', getInlineSVG('MENU_2', 'hamburger-icon'));

        // Inject close icon into close button
        const closeBtn = document.getElementById('mobile-menu-close');
        if (closeBtn) {
            closeBtn.insertAdjacentHTML('afterbegin', getInlineSVG('X', 'close-icon'));
        }

        // Create backdrop element
        this.mobileMenuBackdrop = document.createElement('div');
        this.mobileMenuBackdrop.className = 'mobile-backdrop';
        document.body.appendChild(this.mobileMenuBackdrop);

        // Click handler for hamburger button - toggles right-panel
        menuBtn.addEventListener('click', () => {
            this.toggleMobileMenu('right-panel');
        });

        // Click handler for close button - closes menu
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.closeMobileMenu();
            });
        }

        // Click handler for backdrop - closes menu
        this.mobileMenuBackdrop.addEventListener('click', () => {
            this.closeMobileMenu();
        });
    }

    private toggleMobileMenu(panel: 'sidebar' | 'right-panel'): void {
        const sidebar = document.querySelector('.sidebar') as HTMLElement;
        const rightPanel = document.querySelector('.right-panel') as HTMLElement;

        if (this.mobileMenuOpen === panel) {
            // Close if same panel clicked again
            this.closeMobileMenu();
        } else {
            // Close any open panel first
            if (sidebar) sidebar.classList.remove('mobile-open');
            if (rightPanel) rightPanel.classList.remove('mobile-open');

            // Open requested panel
            if (panel === 'sidebar' && sidebar) {
                sidebar.classList.add('mobile-open');
            } else if (panel === 'right-panel' && rightPanel) {
                rightPanel.classList.add('mobile-open');
            }

            // Show backdrop
            if (this.mobileMenuBackdrop) {
                this.mobileMenuBackdrop.classList.add('active');
            }

            this.mobileMenuOpen = panel;
        }
    }

    private closeMobileMenu(): void {
        const sidebar = document.querySelector('.sidebar') as HTMLElement;
        const rightPanel = document.querySelector('.right-panel') as HTMLElement;

        if (sidebar) sidebar.classList.remove('mobile-open');
        if (rightPanel) rightPanel.classList.remove('mobile-open');

        if (this.mobileMenuBackdrop) {
            this.mobileMenuBackdrop.classList.remove('active');
        }

        this.mobileMenuOpen = null;
    }

    private setupScheduleMobileMenu(): void {
        const scheduleMenuBtn = document.getElementById('schedule-mobile-menu-btn');
        if (!scheduleMenuBtn) return;

        // Inject hamburger icon
        scheduleMenuBtn.insertAdjacentHTML('afterbegin', getInlineSVG('MENU_2', 'hamburger-icon'));

        // Inject close icon into schedule close button
        const scheduleCloseBtn = document.getElementById('schedule-mobile-close');
        if (scheduleCloseBtn) {
            scheduleCloseBtn.insertAdjacentHTML('afterbegin', getInlineSVG('X', 'close-icon'));
        }

        // Click handler for schedule floating button - toggles schedule sidebar
        scheduleMenuBtn.addEventListener('click', () => {
            const scheduleSidebar = document.querySelector('.schedule-sidebar') as HTMLElement;
            if (!scheduleSidebar) return;

            const isOpen = scheduleSidebar.classList.contains('mobile-open');

            if (isOpen) {
                // Close
                scheduleSidebar.classList.remove('mobile-open');
                if (this.mobileMenuBackdrop) {
                    this.mobileMenuBackdrop.classList.remove('active');
                }
            } else {
                // Open
                scheduleSidebar.classList.add('mobile-open');
                if (this.mobileMenuBackdrop) {
                    this.mobileMenuBackdrop.classList.add('active');
                }
            }
        });

        // Click handler for schedule close button
        if (scheduleCloseBtn) {
            scheduleCloseBtn.addEventListener('click', () => {
                const scheduleSidebar = document.querySelector('.schedule-sidebar') as HTMLElement;
                if (scheduleSidebar) {
                    scheduleSidebar.classList.remove('mobile-open');
                }
                if (this.mobileMenuBackdrop) {
                    this.mobileMenuBackdrop.classList.remove('active');
                }
            });
        }
    }

    private setupSettingsMenu(): void {
        const settingsBtn = document.getElementById('settings-menu-btn');
        if (!settingsBtn) return;

        // Inject settings icon
        settingsBtn.insertAdjacentHTML('afterbegin', getInlineSVG('SETTINGS', 'settings-icon'));

        // Create dropdown menu element
        const dropdown = document.createElement('div');
        dropdown.className = 'settings-dropdown-menu';
        dropdown.id = 'settings-dropdown-menu';

        // Create menu items
        const menuItems = [
            {
                icon: 'CALENDAR_UP',
                label: 'Schedules',
                action: () => {
                    this.openSchedulePicker();
                    this.closeSettingsMenu();
                }
            },
            {
                icon: 'BRIGHTNESS',
                label: 'Toggle Theme',
                action: () => {
                    this.toggleTheme();
                    this.closeSettingsMenu();
                }
            },
            {
                icon: 'ARROW_BACK_UP',
                label: 'Undo',
                id: 'settings-undo-btn',
                action: () => {
                    this.handleUndo();
                    this.closeSettingsMenu();
                },
                checkDisabled: () => !this.profileStateManager.canUndo()
            },
            {
                icon: 'ARROW_FORWARD_UP',
                label: 'Redo',
                id: 'settings-redo-btn',
                action: () => {
                    this.handleRedo();
                    this.closeSettingsMenu();
                },
                checkDisabled: () => !this.profileStateManager.canRedo()
            }
        ];

        menuItems.forEach(item => {
            const menuItem = document.createElement('button');
            menuItem.className = 'settings-menu-item';
            if (item.id) menuItem.id = item.id;

            // Add icon
            menuItem.insertAdjacentHTML('afterbegin', getInlineSVG(item.icon as any, 'menu-item-icon'));

            // Add label
            const label = document.createElement('span');
            label.textContent = item.label;
            menuItem.appendChild(label);

            // Check if should be disabled
            if (item.checkDisabled && item.checkDisabled()) {
                menuItem.disabled = true;
            }

            // Add click handler
            menuItem.addEventListener('click', () => {
                if (!menuItem.disabled) {
                    item.action();
                }
            });

            dropdown.appendChild(menuItem);
        });

        document.body.appendChild(dropdown);

        // Toggle dropdown on settings button click
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('active');

            if (isOpen) {
                this.closeSettingsMenu();
            } else {
                dropdown.classList.add('active');

                // Update undo/redo button states
                const undoBtn = document.getElementById('settings-undo-btn') as HTMLButtonElement;
                const redoBtn = document.getElementById('settings-redo-btn') as HTMLButtonElement;
                if (undoBtn) undoBtn.disabled = !this.profileStateManager.canUndo();
                if (redoBtn) redoBtn.disabled = !this.profileStateManager.canRedo();
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (!dropdown.contains(target) && target !== settingsBtn && !settingsBtn.contains(target)) {
                this.closeSettingsMenu();
            }
        });
    }

    private closeSettingsMenu(): void {
        const dropdown = document.getElementById('settings-dropdown-menu');
        if (dropdown) {
            dropdown.classList.remove('active');
        }
    }

    private toggleTheme(): void {
        const currentThemeId = this.themeManager.getCurrentThemeId();

        // Toggle between light and dark themes
        if (currentThemeId === 'wpi-dark') {
            this.themeManager.setTheme('wpi-light');
        } else {
            this.themeManager.setTheme('wpi-dark');
        }
    }

    // Public test method to manually trigger refresh prompt
    public triggerTestRefresh(): void {
        const event = new CustomEvent('data-update-available', {
            detail: { serverTimestamp: new Date().toISOString() }
        });
        window.dispatchEvent(event);
        console.log('Test refresh triggered - status indicator should show "Refresh" and auto-refresh data');
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

    public getFilterService(): CourseFilterService {
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
            const searchCriteria = searchTextFilter?.criteria as { query?: string } | undefined;
            const currentQuery = searchCriteria?.query || '';
            if (searchInput.value !== currentQuery) {
                searchInput.value = currentQuery;
            }
        }
    }

    private updateFilteredHeader(resultCount: number, _selectedDepartment: Department | null): void {
        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            const filters = this.filterService.getActiveFilters();
            const searchTextFilter = filters.find(f => f.id === 'searchText');

            if (searchTextFilter && filters.length === 1) {
                // Only search text filter
                const searchCriteria = searchTextFilter.criteria as { query?: string };
                const query = searchCriteria.query;
                contentHeader.textContent = `Search: "${query}" (${resultCount} results)`;
            } else if (searchTextFilter) {
                // Search text + other filters
                const searchCriteria = searchTextFilter.criteria as { query?: string };
                const query = searchCriteria.query;
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

}