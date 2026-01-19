import { Course, Department } from '../../types/types'
import { SelectedCourse } from '../../types/schedule'
import { CourseDataService } from '../../services/data/courseDataService'
import { ThemeSelector } from '../components/ThemeSelector'
import { SchedulePickerModal } from '../components/SchedulePickerModal'
import { CourseSelectionService } from '../../services/selection/CourseSelectionService'
import { ConflictDetector } from '../../core/scheduling/ConflictEngine'
import { getAllSections } from '../../utils/courseUtils'
import { ModalService } from '../../services/ui/ModalService'
import { DepartmentController } from './DepartmentController'
import { CourseController } from './CourseController'
import { ScheduleController } from './ScheduleController'
import { SectionInfoModalController } from './SectionInfoModalController'
import { InfoModalController } from './InfoModalController'
import { FilterModalController } from './FilterModalController'
import { ScheduleFilterModalController } from './ScheduleFilterModalController'
import { CourseFilterService } from '../../services/filtering/CourseFilterService'
import { ScheduleFilterService } from '../../services/filtering/ScheduleFilterService'
import { SearchService } from '../../services/filtering/searchService'
import { createDefaultFilters, SearchTextFilter } from '../../core/filtering/filters'
import { rateMyProfessorService } from '../../services/external/RateMyProfessorService'
import { UIStateManager } from './UIStateManager'
import { TimestampManager } from './TimestampManager'
import { OperationManager, DebouncedOperation } from '../../utils/RequestCancellation'
import { ScheduleManagementService } from '../../services/selection/ScheduleManagementService'
import { ProfileStateManager } from '../../core/state/ProfileStateManager'
import { StorageService } from '../../services/selection/StorageService'
import { ThemeManager } from '../../themes/ThemeManager'
import { getInlineSVG } from '../../utils/iconPaths'
import { CloudStatusButton } from '../components/CloudStatusButton'
import { syncManager } from '../../services/sync/SyncManager'
import { providerRegistry } from '../../services/sync/ProviderRegistry'
import { syncEventBus } from '../../services/sync/SyncEventBus'
import type { ConflictInfo, SyncData } from '../../services/sync/types'
import { ConflictResolutionModal } from '../components/ConflictResolutionModal'
import { ChangelogModal } from '../components/ChangelogModal'
import { ResizablePanel } from '../components/ResizablePanel'
import { TermBoundsService } from '../../services/data/TermBoundsService'

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
    private scheduleManagementService: ScheduleManagementService;
    private cloudStatusButton: CloudStatusButton;
    private conflictResolutionModal: ConflictResolutionModal;
    private changelogModal: ChangelogModal;
    private cloudSyncMenuItem: HTMLButtonElement | null = null;
    private resizablePanel: ResizablePanel | null = null;
    private allDepartments: Department[] = [];
    private expandedTerms: Map<string, string> = new Map(); // courseId -> expanded term letter
    private pendingExpansions: Array<{courseId: string, term: string}> = [];


    constructor() {
        // Initialize core storage and state management first
        this.profileStateManager = ProfileStateManager.getInstance();
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
        this.profileStateManager.setModalService(this.modalService);
        this.departmentController = new DepartmentController();
        
        // Initialize search and filter services
        this.searchService = new SearchService();
        this.filterService = new CourseFilterService(
            this.searchService,
            () => this.profileStateManager.getBookmarkedCourseIds()
        );
        this.scheduleFilterService = new ScheduleFilterService(rateMyProfessorService);
        
        // Initialize schedule management service with shared ProfileStateManager and CourseSelectionService
        this.scheduleManagementService = new ScheduleManagementService(this.profileStateManager, this.courseSelectionService);
        
        // Initialize managers (before any event listeners that might use them)
        this.uiStateManager = new UIStateManager();
        this.timestampManager = new TimestampManager();
        this.operationManager = new OperationManager();
        this.debouncedSearch = new DebouncedOperation(this.operationManager, 'search', 300);

        // Sync UI components (no provider currently configured)
        this.cloudStatusButton = new CloudStatusButton('cloud-status-button-container');
        this.conflictResolutionModal = new ConflictResolutionModal(this.modalService);
        this.changelogModal = new ChangelogModal(this.modalService);

        // Initialize controllers
        this.courseController = new CourseController(this.courseSelectionService, this.courseDataService);
        this.scheduleController = new ScheduleController(this.courseSelectionService);
        this.sectionInfoModalController = new SectionInfoModalController(this.modalService);
        this.infoModalController = new InfoModalController(this.modalService);
        this.filterModalController = new FilterModalController(this.modalService);
        this.scheduleFilterModalController = new ScheduleFilterModalController(this.modalService);
        
        // Connect filter service to course controller
        this.courseController.setFilterService(this.filterService);

        // Register rendering callbacks for term expansion state management
        this.courseController.setOnBatchCallback(() => {
            this.restoreTermExpansionState();
        });
        this.courseController.setOnRenderCompleteCallback(() => {
            this.processPendingExpansions();
        });

        // Connect filter service and course data to filter modal
        this.filterModalController.setFilterService(this.filterService);
        this.filterModalController.setCourseSelectionService(this.courseSelectionService);
        
        // Connect schedule filter service to controllers
        this.scheduleFilterModalController.setScheduleFilterService(this.scheduleFilterService);
        this.scheduleController.setCourseDataService(this.courseDataService);
        this.scheduleController.setConflictDetector(this.conflictDetector);
        this.scheduleController.setScheduleFilterService(this.scheduleFilterService);
        this.scheduleController.setScheduleFilterModalController(this.scheduleFilterModalController);
        this.scheduleController.setScheduleManagementService(this.scheduleManagementService);

        // Set modal controllers for ScheduleController
        this.scheduleController.setSectionInfoModalController(this.sectionInfoModalController);
        this.scheduleController.setModalService(this.modalService);

        // Set up schedule update callback for calendar event exclusions
        this.scheduleController.setScheduleUpdateCallback((scheduleId, updates) => {
            this.profileStateManager.updateSchedule(scheduleId, updates, 'calendar-event-exclusion');
        });

        // Connect filter service to department controller
        this.departmentController.setFilterService(this.filterService);

        // Set up course data event subscriptions
        this.setupCourseDataSubscriptions();

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

    /**
     * Set up event subscriptions for course data changes
     */
    private setupCourseDataSubscriptions(): void {
        // Subscribe to data-loaded event
        this.courseDataService.on('data-loaded', (event) => {
            // Phase 1: Set catalog (needed for section reconstruction)
            this.profileStateManager.setCourseData(event.departments);
            this.searchService.setCourseData(event.departments);
            this.filterModalController.setCourseData(event.departments);

            // Phase 2: Set department data
            this.departmentController.setAllDepartments(event.departments);
            this.courseController.setAllDepartments(event.departments);
            this.courseSelectionService.setAllDepartments(event.departments);

            // Phase 3: Post-load operations
            this.courseSelectionService.reconstructSectionObjects();
            this.scheduleManagementService.initializeDefaultScheduleIfNeeded();
            this.timestampManager.updateClientTimestamp();

            // Store reference for later use
            this.allDepartments = event.departments;
        });

        // Subscribe to data-refreshed event (after cloud sync)
        this.courseDataService.on('data-refreshed', (event) => {
            this.profileStateManager.setCourseData(event.departments);
            this.searchService.setCourseData(event.departments);
            this.filterModalController.setCourseData(event.departments);
            this.departmentController.setAllDepartments(event.departments);
            this.courseController.setAllDepartments(event.departments);
            this.courseSelectionService.setAllDepartments(event.departments);
        });
    }

    private initializeFilters(): void {
        const filters = createDefaultFilters(rateMyProfessorService);
        filters.forEach(filter => {
            this.filterService.registerFilter(filter);
        });

        // Register SearchTextFilter
        const searchTextFilter = new SearchTextFilter();
        this.filterService.registerFilter(searchTextFilter);

        // Register PeriodConflictFilter
        this.filterService.setConflictDetector(this.conflictDetector);

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
            this.updateBookmarkFilterButtonState();
        }, 100);
    }

    private async init(): Promise<void> {
        this.uiStateManager.showLoadingState();

        try {
            // Initialize StorageService and load persisted data
            await this.storageService.initialize();
            this._themeSelector.initializeTheme();
            await rateMyProfessorService.loadData();
            await this.courseSelectionService.initialize();
            await this.scheduleManagementService.initialize();

            await TermBoundsService.getInstance().loadTermBounds();

            await this.loadCourseData();

            this.departmentController.displayDepartments();

            // Set "All Departments" as the default selection on startup
            this.initializeDefaultDepartmentView();

            setTimeout(() => {
                this.changelogModal.show();
            }, 500);

            this.setupEventListeners();
            this.setupCloudStatusButtonListener();
            this.setupCourseSelectionListener();
            this.setupScheduleChangeListener();

            // Load active schedule into ScheduleController (for local events, etc.)
            const activeSchedule = this.scheduleManagementService.getActiveSchedule();
            if (activeSchedule) {
                this.scheduleController.loadExternalEvents(activeSchedule);
            }

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

    private async loadCourseData(): Promise<void> {
        try {
            // Load course data - event listeners handle distribution
            const scheduleDB = await this.courseDataService.loadCourseData();

            // Load server timestamp
            await this.timestampManager.loadServerTimestamp();

            console.log(`[MainController] Course data loaded: ${scheduleDB.departments.length} departments`);
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
                    
                    // Use the department controller which updates the filter service
                    this.departmentController.handleDepartmentClick(deptId, multiSelect);
                    // The filter service listener triggers refreshCurrentView automatically
                }
            }
            
            if (target.classList.contains('section-badge')) {
                target.classList.toggle('selected');
            }

            if (target.classList.contains('term-badge') || target.closest('.term-badge')) {
                e.stopPropagation();
                const termBadge = target.classList.contains('term-badge') ? target : target.closest('.term-badge') as HTMLElement;
                const clickedTerm = termBadge?.dataset.term;
                const courseSections = termBadge?.closest('.course-sections') as HTMLElement;

                if (!clickedTerm || !courseSections) return;

                // Get courseId from the course-sections container
                const courseId = courseSections.dataset.courseId;
                if (!courseId) return;

                // Check if rendering is in progress
                if (this.courseController.isRendering()) {
                    // Queue the expansion for later
                    this.pendingExpansions.push({ courseId, term: clickedTerm });
                    console.log(`Queued term expansion: ${courseId} -> ${clickedTerm}`);
                    return;
                }

                const termBadgesContainer = courseSections.querySelector('.term-badges-container') as HTMLElement;
                const termSectionsContainers = courseSections.querySelectorAll('.term-sections-container') as NodeListOf<HTMLElement>;
                const clickedTermContainer = courseSections.querySelector(`.term-sections-container[data-term="${clickedTerm}"]`) as HTMLElement;

                // Check if this term is already expanded
                const isExpanded = clickedTermContainer && clickedTermContainer.style.display !== 'none';

                // Get current height before changes
                const currentHeight = courseSections.scrollHeight;

                // Set starting height
                courseSections.style.maxHeight = `${currentHeight}px`;

                if (isExpanded) {
                    // Update state: term is being collapsed
                    this.expandedTerms.delete(courseId);

                    // Stagger animate badges out by row in reverse
                    const sectionBadges = Array.from(clickedTermContainer.querySelectorAll('.section-badge')) as HTMLElement[];
                    const rows = this.groupBadgesByRow(sectionBadges);
                    const reversedRows = [...rows].reverse();

                    reversedRows.forEach((rowBadges, rowIndex) => {
                        rowBadges.forEach((badge, badgeIndex) => {
                            setTimeout(() => {
                                badge.style.opacity = '0';
                                badge.style.transform = 'translateX(-10px)';
                            }, rowIndex * 30 + badgeIndex * 15);
                        });
                    });

                    const badgeAnimTime = reversedRows.length * 30;

                    // Animate height and padding to 0 after badges start fading
                    setTimeout(() => {
                        clickedTermContainer.style.maxHeight = '0';
                        clickedTermContainer.style.paddingTop = '0';

                        // Rotate icon back
                        const termIcon = clickedTermContainer.querySelector('.term-badge.active .term-icon') as HTMLElement;
                        if (termIcon) {
                            termIcon.style.transform = 'rotate(0deg)';
                        }
                    }, badgeAnimTime);

                    // After transition, swap containers
                    setTimeout(() => {
                        termSectionsContainers.forEach(c => c.style.display = 'none');

                        // Set initial state for term badges
                        const termBadges = termBadgesContainer.querySelectorAll('.term-badge') as NodeListOf<HTMLElement>;
                        termBadges.forEach(badge => {
                            badge.style.opacity = '0';
                            badge.style.transform = 'translateX(-10px)';
                            badge.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
                        });

                        termBadgesContainer.style.display = 'flex';
                        termBadgesContainer.style.opacity = '1';

                        // Stagger animate term badges in
                        requestAnimationFrame(() => {
                            termBadges.forEach((badge, i) => {
                                setTimeout(() => {
                                    badge.style.opacity = '1';
                                    badge.style.transform = 'translateX(0)';
                                }, i * 30);
                            });
                        });

                        courseSections.classList.remove('expanded');
                    }, badgeAnimTime + 300);
                } else {
                    // Update state: term is being expanded
                    this.expandedTerms.set(courseId, clickedTerm);

                    // Use extracted animation function
                    this.animateTermExpansion(courseSections, termBadgesContainer, termSectionsContainers, clickedTermContainer);
                }
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

            if (target.classList.contains('course-bookmark-btn')) {
                const courseElement = target.closest('.course-item, .course-card') as HTMLElement;
                if (courseElement) {
                    this.courseController.toggleCourseBookmark(courseElement);
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

                // Wrap display operations in batch mode to prevent multiple saves
                const stateManager = ProfileStateManager.getInstance();
                stateManager.withBatchSync(() => {
                    this.scheduleController.displayScheduleSelectedCourses();
                    this.scheduleController.renderScheduleGrids();
                });
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

        // Bookmark filter toggle button
        const bookmarkFilterButton = document.getElementById('bookmark-filter-btn');
        if (bookmarkFilterButton) {
            // Icon is set by updateBookmarkFilterButtonState during initialization
            bookmarkFilterButton.addEventListener('click', () => {
                if (this.filterService.hasFilter('bookmark')) {
                    this.filterService.removeFilter('bookmark');
                } else {
                    this.filterService.addFilter('bookmark', { showBookmarkedOnly: true });
                }
                this.updateBookmarkFilterButtonState();
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
                    this.updateBookmarkFilterButtonState();
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

        // Resizable panels
        this.setupResizablePanels();

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

    private groupBadgesByRow(badges: HTMLElement[]): HTMLElement[][] {
        const badgesByRow = new Map<number, HTMLElement[]>();
        badges.forEach(badge => {
            const top = badge.offsetTop;
            if (!badgesByRow.has(top)) {
                badgesByRow.set(top, []);
            }
            badgesByRow.get(top)!.push(badge);
        });
        return Array.from(badgesByRow.values());
    }

    private animateTermExpansion(
        courseSections: HTMLElement,
        termBadgesContainer: HTMLElement,
        termSectionsContainers: NodeListOf<HTMLElement>,
        clickedTermContainer: HTMLElement,
        onComplete?: () => void
    ): void {
        courseSections.classList.add('expanded');

        // Hide term badges immediately
        termBadgesContainer.style.display = 'none';
        termSectionsContainers.forEach(c => c.style.display = 'none');

        // Show clicked container
        clickedTermContainer.style.display = 'flex';
        clickedTermContainer.style.opacity = '1';

        // Set initial state for section badges
        const sectionBadges = clickedTermContainer.querySelectorAll('.section-badge') as NodeListOf<HTMLElement>;
        sectionBadges.forEach(badge => {
            badge.style.opacity = '0';
            badge.style.transform = 'translateX(-10px)';
            badge.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
        });

        // Measure with padding, then animate from 0
        clickedTermContainer.style.paddingTop = '0.5rem';
        clickedTermContainer.style.maxHeight = 'none';
        const targetHeight = clickedTermContainer.scrollHeight;
        clickedTermContainer.style.maxHeight = '0';
        clickedTermContainer.style.paddingTop = '0';

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                clickedTermContainer.style.paddingTop = '0.5rem';
                clickedTermContainer.style.maxHeight = `${targetHeight}px`;
                courseSections.style.maxHeight = `${targetHeight}px`;

                // Stagger animate badges in by row
                const rows = this.groupBadgesByRow(Array.from(sectionBadges));
                rows.forEach((rowBadges, rowIndex) => {
                    rowBadges.forEach((badge, badgeIndex) => {
                        setTimeout(() => {
                            badge.style.opacity = '1';
                            badge.style.transform = 'translateX(0)';
                        }, rowIndex * 30 + badgeIndex * 15);
                    });
                });
            });
        });

        // Rotate icon
        const termIcon = clickedTermContainer.querySelector('.term-badge.active .term-icon') as HTMLElement;
        if (termIcon) {
            termIcon.style.transition = 'transform 0.3s ease';
            termIcon.style.transform = 'rotate(45deg)';
        }

        if (onComplete) {
            const rows = this.groupBadgesByRow(Array.from(sectionBadges));
            const totalTime = Math.max(300, rows.length * 30 + 150);
            setTimeout(onComplete, totalTime);
        }
    }

    private restoreTermExpansionState(): void {
        // Restore expansion state for all courses that have expanded terms
        this.expandedTerms.forEach((expandedTerm, courseId) => {
            const courseSections = document.querySelector(`.course-sections[data-course-id="${courseId}"]`) as HTMLElement;
            if (!courseSections) return;

            const termBadgesContainer = courseSections.querySelector('.term-badges-container') as HTMLElement;
            const termSectionsContainers = courseSections.querySelectorAll('.term-sections-container') as NodeListOf<HTMLElement>;
            const expandedTermContainer = courseSections.querySelector(`.term-sections-container[data-term="${expandedTerm}"]`) as HTMLElement;

            if (!expandedTermContainer || !termBadgesContainer) return;

            // Mark as expanded for full-width layout
            courseSections.classList.add('expanded');

            // Hide term badges container
            termBadgesContainer.style.display = 'none';

            // Hide all term sections
            termSectionsContainers.forEach(container => {
                container.style.display = 'none';
            });

            // Show the expanded term container
            expandedTermContainer.style.display = 'flex';
            expandedTermContainer.style.opacity = '1';
            expandedTermContainer.style.transform = 'translateX(0)';

            // Set course sections max height
            courseSections.style.maxHeight = `${expandedTermContainer.scrollHeight}px`;
        });
    }

    private processPendingExpansions(): void {
        // Process all queued term expansions with animations
        console.log(`Processing ${this.pendingExpansions.length} pending expansions`);

        this.pendingExpansions.forEach(({ courseId, term }) => {
            const courseSections = document.querySelector(`.course-sections[data-course-id="${courseId}"]`) as HTMLElement;
            if (!courseSections) {
                console.warn(`Course sections not found for ${courseId}`);
                return;
            }

            // Add to expanded state
            this.expandedTerms.set(courseId, term);

            const termBadgesContainer = courseSections.querySelector('.term-badges-container') as HTMLElement;
            const termSectionsContainers = courseSections.querySelectorAll('.term-sections-container') as NodeListOf<HTMLElement>;
            const clickedTermContainer = courseSections.querySelector(`.term-sections-container[data-term="${term}"]`) as HTMLElement;

            if (!clickedTermContainer || !termBadgesContainer) {
                console.warn(`Term container not found for ${courseId} term ${term}`);
                return;
            }

            // Get current height and set starting height
            const currentHeight = courseSections.scrollHeight;
            courseSections.style.maxHeight = `${currentHeight}px`;

            // Use extracted animation function
            this.animateTermExpansion(courseSections, termBadgesContainer, termSectionsContainers, clickedTermContainer);

            console.log(`Expanding ${courseId} -> ${term} with animation`);
        });

        // Clear the queue
        this.pendingExpansions = [];
    }

    private refreshCurrentView(): void {
        this.expandedTerms.clear();

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

    private updateBookmarkFilterButtonState(): void {
        const button = document.getElementById('bookmark-filter-btn');
        if (button && this.filterService) {
            const isActive = this.filterService.hasFilter('bookmark');
            button.classList.toggle('active', isActive);

            // Swap icon between outline and filled
            const iconClass = 'bookmark-icon';
            const existingIcon = button.querySelector(`.${iconClass}`);
            if (existingIcon) {
                existingIcon.remove();
            }
            const icon = isActive ? 'BOOKMARK_FILLED' : 'BOOKMARK';
            button.insertAdjacentHTML('afterbegin', getInlineSVG(icon, iconClass));

            // Update title
            button.title = isActive ? 'Show all courses' : 'Show bookmarked only';
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

    private setupCloudStatusButtonListener(): void {
        this.profileStateManager.addListener((event, state) => {
            this.cloudStatusButton.onStateChange(event, state);
            this.updateCloudSyncMenuItem();
        });
    }

    private updateCloudSyncMenuItem(): void {
        if (!this.cloudSyncMenuItem) return;

        const icon = this.cloudStatusButton.getCurrentIcon() || 'CALENDAR_UP';
        const text = this.cloudStatusButton.getCurrentText();

        const iconElement = this.cloudSyncMenuItem.querySelector('.menu-item-icon');
        const textElement = this.cloudSyncMenuItem.querySelector('span');

        if (iconElement) {
            iconElement.outerHTML = getInlineSVG(icon, 'menu-item-icon');
        }

        if (textElement) {
            textElement.textContent = text;
        }
    }

    private setupScheduleChangeListener(): void {
        this.scheduleManagementService.onActiveScheduleChange((_activeSchedule, event) => {
            this.updateSchedulePickerButton();

            // Skip reloading events if this was just an exclusion change
            // (the UI already updated optimistically, no need to refetch)
            if (event?.source === 'calendar-event-exclusion') {
                console.log('[MainController] Skipping external events reload for exclusion change');
                return;
            }

            // Load schedule data (including local events) for the new active schedule
            const activeSchedule = this.scheduleManagementService.getActiveSchedule();
            if (activeSchedule) {
                console.log('[MainController] Loading schedule data after schedule change');
                this.scheduleController.loadExternalEvents(activeSchedule);
            }
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
            this.refreshUI();
        }).catch(error => {
            console.error('Undo failed:', error);
            this.uiStateManager.showErrorMessage('Failed to undo. Please try again.');
        });
    }

    private handleRedo(): void {
        this.profileStateManager.redo().then(() => {
            this.refreshUI();
        }).catch(error => {
            console.error('Redo failed:', error);
            this.uiStateManager.showErrorMessage('Failed to redo. Please try again.');
        });
    }

    private refreshUI(): void {
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
            },
            {
                icon: this.cloudStatusButton.getCurrentIcon() || 'CALENDAR_UP',
                label: this.cloudStatusButton.getCurrentText(),
                id: 'settings-cloud-sync-btn',
                action: async () => {
                    await this.cloudStatusButton.triggerClick();
                    this.closeSettingsMenu();
                },
                isCloudSync: true
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

            // Store reference to cloud sync menu item
            if ((item as any).isCloudSync) {
                this.cloudSyncMenuItem = menuItem;
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

    private setupResizablePanels(): void {
        this.resizablePanel = new ResizablePanel({
            panels: [
                {
                    handleSelector: '.resize-handle-left',
                    targetProperty: '--panel-sidebar-width',
                    minWidth: 200,
                    maxWidth: 400,
                    defaultWidth: 280,
                    direction: 'left'
                },
                {
                    handleSelector: '.resize-handle-right',
                    targetProperty: '--panel-right-width',
                    minWidth: 250,
                    maxWidth: 1000,
                    defaultWidth: 700,
                    direction: 'right'
                },
                {
                    handleSelector: '.resize-handle-schedule',
                    targetProperty: '--panel-schedule-sidebar-width',
                    minWidth: 200,
                    maxWidth: 500,
                    defaultWidth: 400,
                    direction: 'left'
                }
            ]
        });
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