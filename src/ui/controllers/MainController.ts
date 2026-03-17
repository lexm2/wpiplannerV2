import { Course, Department } from '../../types/types'
import { SelectedCourse } from '../../types/schedule'
import { ThemeSelector } from '../components/ThemeSelector'
import { SchedulePickerModal } from '../components/SchedulePickerModal'
import { DepartmentController } from './DepartmentController'
import { CourseController } from './CourseController'
import { ScheduleController } from './ScheduleController'
import { SectionInfoModalController } from './SectionInfoModalController'
import { InfoModalController } from './InfoModalController'
import { FilterModalController } from './FilterModalController'
import { ProfileStateManager } from '../../core/state/ProfileStateManager'
import { getInlineSVG, type IconName } from '../../utils/iconPaths'
import { ResizablePanel } from '../components/ResizablePanel'
import { SwipeGestureHandler } from '../utils/SwipeGestureHandler'
import { DeviceDetection } from '../../utils/deviceDetection'
import { DebouncedOperation, CancellationToken } from '../../utils/RequestCancellation'
import { CourseColorService } from '../../services/scheduling/CourseColorService'
import { AutoScheduleOrchestrator } from '../../services/scheduling/AutoScheduleOrchestrator'
import { AppBootstrap } from '../../bootstrap/AppBootstrap'
import type { ServiceContainer } from '../../bootstrap/ServiceContainer'
import type { ModalService } from '../../services/ui/ModalService'
import type { SelectionSnapshot } from '../../types/scheduling'

/**
 * UI controller managing DOM event binding, view refreshing, and sub-controller coordination
 */
export class MainController {
    private services: ServiceContainer;
    private schedulePickerModal: SchedulePickerModal | null = null;
    private themeSelector: ThemeSelector;
    private departmentController: DepartmentController;
    private courseController: CourseController;
    private scheduleController: ScheduleController;
    private sectionInfoModalController: SectionInfoModalController;
    private filterModalController: FilterModalController;
    private scheduleFilterModalController: FilterModalController;
    private debouncedSearch: DebouncedOperation;
    private colorService: CourseColorService;
    private autoScheduleOrchestrator: AutoScheduleOrchestrator;
    private allDepartments: Department[] = [];
    private expandedTerms: Map<string, string> = new Map(); // courseId -> expanded term letter
    private pendingExpansions: Array<{courseId: string, term: string}> = [];


    constructor(services: ServiceContainer) {
        this.services = services;

        const {
            profileStateManager, courseDataService, courseSelectionService,
            conflictDetector, modalService, filterService,
            scheduleManagementService, operationManager, uiStateManager
        } = services;

        this.themeSelector = new ThemeSelector(profileStateManager);
        this.debouncedSearch = new DebouncedOperation(operationManager, 'search', 300);

        // Initialize extracted services
        this.colorService = new CourseColorService(courseSelectionService);
        this.autoScheduleOrchestrator = new AutoScheduleOrchestrator(courseSelectionService, filterService);

        // Initialize controllers
        this.departmentController = new DepartmentController();
        this.courseController = new CourseController(courseSelectionService, courseDataService);
        this.scheduleController = new ScheduleController(courseSelectionService, this.colorService, this.autoScheduleOrchestrator);
        this.sectionInfoModalController = new SectionInfoModalController(modalService);
        new InfoModalController(modalService);
        this.filterModalController = new FilterModalController(modalService);
        this.scheduleFilterModalController = new FilterModalController(modalService);

        // Connect filter service to course controller
        this.courseController.setFilterService(filterService);

        // Register rendering callbacks for term expansion state management
        this.courseController.setOnBatchCallback(() => {
            this.restoreTermExpansionState();
        });
        this.courseController.setOnRenderCompleteCallback(() => {
            this.processPendingExpansions();
        });

        // Connect filter service and course data to filter modal
        this.filterModalController.setFilterService(filterService);
        this.filterModalController.setCourseSelectionService(courseSelectionService);
        this.filterModalController.setAutoScheduleOrchestrator(this.autoScheduleOrchestrator);

        // Connect schedule filter service to controllers
        this.scheduleFilterModalController.setFilterService(filterService);
        this.scheduleFilterModalController.setCourseSelectionService(courseSelectionService);
        this.scheduleFilterModalController.setAutoScheduleOrchestrator(this.autoScheduleOrchestrator);
        this.scheduleController.setCourseDataService(courseDataService);
        this.scheduleController.setConflictDetector(conflictDetector);
        this.scheduleController.setFilterService(filterService);

        // Set modal controllers for ScheduleController
        this.scheduleController.setSectionInfoModalController(this.sectionInfoModalController);
        this.scheduleController.setModalService(modalService);

        // Set up schedule update callback for calendar event exclusions
        this.scheduleController.setScheduleUpdateCallback((scheduleId, updates) => {
            profileStateManager.updateSchedule(scheduleId, updates, 'calendar-event-exclusion');
        });

        // Connect filter service to department controller
        this.departmentController.setFilterService(filterService);

        // Set up course data event subscriptions via AppBootstrap
        AppBootstrap.setupCourseDataSubscriptions(services, {
            setAllDepartments: (departments) => {
                this.allDepartments = departments;
            },
            onDataLoaded: (departments) => {
                this.filterModalController.setCourseData(departments);
                this.scheduleFilterModalController.setCourseData(departments);
                this.departmentController.setAllDepartments(departments);
                this.courseController.setAllDepartments(departments);
            },
            onDataRefreshed: (departments) => {
                this.filterModalController.setCourseData(departments);
                this.scheduleFilterModalController.setCourseData(departments);
                this.departmentController.setAllDepartments(departments);
                this.courseController.setAllDepartments(departments);
                this.departmentController.displayDepartments();
                this.refreshCurrentView();
            },
        });

        // Initialize tracking for course changes
        const initialSelectedCourses = courseSelectionService.getSelectedCourses();
        this.previousSelectedCoursesCount = initialSelectedCourses.length;
        this.previousSelectedCoursesMap = new Map();
        initialSelectedCourses.forEach(sc => {
            this.previousSelectedCoursesMap.set(sc.course.id, {
                lecture: sc.selectedLecture?.number || null,
                discussion: sc.selectedDiscussion?.number || null,
                lab: sc.selectedLab?.number || null
            });
        });

        // Initialize filters and wire up filter change listeners
        AppBootstrap.initializeFilters(services);

        filterService.addEventListener((_event) => {
            this.refreshCurrentView();
            this.scheduleController.applyFiltersAndRefresh();
        });

        // Initialize filter button states
        setTimeout(() => {
            this.updateFilterButtonState();
            this.updateScheduleFilterButtonState();
            this.updateBookmarkFilterButtonState();
        }, 100);

        this.init();
    }

    closeWizard(): void {
        this.scheduleController.closeComponentWizard();
    }

    openWizardForCourse(courseId: string): void {
        const selectedCourses = this.services.courseSelectionService.getSelectedCourses();
        const selected = selectedCourses.find(sc => sc.course.id === courseId);
        if (!selected) return;
        this.scheduleController.openComponentWizard(selected.course, selected);
    }

    private async init(): Promise<void> {
        this.services.uiStateManager.showLoadingState();

        try {
            await AppBootstrap.initializeAsyncServices(this.services);
            this.themeSelector.initializeTheme();

            this.departmentController.displayDepartments();

            // Set "All Departments" as the default selection on startup
            this.initializeDefaultDepartmentView();

            this.setupEventListeners();
            this.setupCourseSelectionListener();
            this.setupScheduleChangeListener();
            this.initializeSwipeNavigation();
            AppBootstrap.setupWindowUnloadHandler();

            // Wire up calendar event provider for auto-scheduler
            this.autoScheduleOrchestrator.setCalendarEventProvider(this.scheduleController);

            // Load active schedule into ScheduleController (for local events, etc.)
            const activeSchedule = this.services.scheduleManagementService.getActiveSchedule();
            if (activeSchedule) {
                this.scheduleController.loadExternalEvents(activeSchedule);
            }

            this.scheduleController.setupAutoScheduleButton();
            this.scheduleController.setupClearAllSectionsButton();
            this.autoScheduleOrchestrator.setupCourseSelectionChangeListener();
            this.courseController.displaySelectedCourses();

            // Initial UI sync for selected courses (use efficient targeted updates)
            this.syncInitialCourseSelectionUI();

            this.updateSelectedCoursesState(this.services.courseSelectionService.getSelectedCourses());

            if (!localStorage.getItem('wpi_visited')) {
                await this.services.tutorial?.start('welcome');
            }
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.services.uiStateManager.showErrorMessage(
                'Failed to initialize application. Some features may not work properly.',
                () => this.services.scheduleManagementService.clearAllSchedules()
            );
        }
    }

    private initializeSwipeNavigation(): void {
        if (!DeviceDetection.isMobilePhone()) return;

        const plannerPage = document.getElementById('planner-page');
        const schedulePage = document.getElementById('schedule-page');

        if (plannerPage) {
            new SwipeGestureHandler(
                plannerPage,
                () => this.handleSwipeLeft(),
                () => this.handleSwipeRight()
            );
        }

        if (schedulePage) {
            new SwipeGestureHandler(
                schedulePage,
                () => this.handleSwipeLeft(),
                () => this.handleSwipeRight()
            );
        }
    }

    private handleSwipeLeft(): void {
        if (this.services.uiStateManager.getCurrentPage() === 'planner') {
            this.services.uiStateManager.switchToPage('schedule');
            this.scheduleController.displayScheduleSelectedCourses();
            this.scheduleController.renderScheduleGrids();
        }
    }

    private handleSwipeRight(): void {
        if (this.services.uiStateManager.getCurrentPage() === 'schedule') {
            this.scheduleController.closeComponentWizard();
            this.services.uiStateManager.switchToPage('planner');
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
                    return;
                }

                const termBadgesContainer = courseSections.querySelector('.term-badges-container') as HTMLElement;
                const termSectionsContainers = courseSections.querySelectorAll('.term-sections-container') as NodeListOf<HTMLElement>;
                const clickedTermContainer = courseSections.querySelector(`.term-sections-container[data-term="${clickedTerm}"]`) as HTMLElement;

                // Check if this term is already expanded
                const isExpanded = clickedTermContainer && clickedTermContainer.style.display !== 'none';

                if (isExpanded) {
                    // Update state: term is being collapsed
                    this.expandedTerms.delete(courseId);

                    const courseItem = courseSections.closest('.course-item') as HTMLElement;

                    // 1. Lock course-item at current height, promote to compositor layer
                    const currentItemHeight = courseItem.getBoundingClientRect().height;
                    courseItem.style.willChange = 'height';
                    courseItem.style.height = `${currentItemHeight}px`;
                    courseItem.style.overflow = 'hidden';

                    // 2. Instantly do the full content swap
                    termSectionsContainers.forEach(c => c.style.display = 'none');
                    courseSections.classList.remove('expanded');
                    courseSections.style.maxHeight = '';

                    // Set initial state for term badges (hidden)
                    const termBadges = termBadgesContainer.querySelectorAll('.term-badge') as NodeListOf<HTMLElement>;
                    termBadges.forEach(badge => {
                        badge.style.opacity = '0';
                        badge.style.transform = 'translateX(-10px)';
                        badge.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
                    });

                    termBadgesContainer.style.display = 'flex';
                    termBadgesContainer.style.opacity = '1';

                    // Reset container styles (badges are hidden via display:none, no need to touch individually)
                    clickedTermContainer.style.cssText = '';
                    clickedTermContainer.style.display = 'none';

                    // Rotate icon back and clear inline styles from expansion
                    const termIcon = clickedTermContainer.querySelector('.term-badge.active .term-icon') as HTMLElement;
                    if (termIcon) {
                        termIcon.style.transform = '';
                        termIcon.style.transition = '';
                    }

                    // 3. Measure target height (temporarily unlock to get true content height)
                    courseItem.style.height = 'auto';
                    const targetItemHeight = courseItem.getBoundingClientRect().height;
                    // Re-lock at starting height
                    courseItem.style.height = `${currentItemHeight}px`;
                    // Force browser to commit starting height before adding transition
                    courseItem.offsetHeight;
                    const collapseDuration = this.getHeightAnimDuration(currentItemHeight, targetItemHeight);
                    courseItem.style.transition = `height ${collapseDuration}s ease`;

                    // 4. Animate to target height
                    requestAnimationFrame(() => {
                        courseItem.style.height = `${targetItemHeight}px`;

                        // Stagger animate term badges in
                        termBadges.forEach((badge, i) => {
                            setTimeout(() => {
                                badge.style.opacity = '1';
                                badge.style.transform = 'translateX(0)';
                            }, i * 30);
                        });

                        // Clean up after transition
                        const cleanup = () => {
                            courseItem.style.height = '';
                            courseItem.style.transition = '';
                            courseItem.style.overflow = '';
                            courseItem.style.willChange = '';
                            // Clean up term badge inline styles
                            termBadges.forEach(badge => {
                                badge.style.cssText = '';
                            });
                        };
                        const onEnd = (e: TransitionEvent) => {
                            if (e.propertyName !== 'height') return;
                            clearTimeout(fallbackTimer);
                            courseItem.removeEventListener('transitionend', onEnd);
                            cleanup();
                        };
                        courseItem.addEventListener('transitionend', onEnd);
                        const fallbackTimer = setTimeout(() => {
                            courseItem.removeEventListener('transitionend', onEnd);
                            cleanup();
                        }, collapseDuration * 1000 + 100);
                    });
                } else {
                    // Update state: term is being expanded
                    this.expandedTerms.set(courseId, clickedTerm);

                    // Use extracted animation function
                    this.animateTermExpansion(courseSections, termBadgesContainer, termSectionsContainers, clickedTermContainer);
                }
            }

            const selectBtn = target.closest('.course-select-btn') as HTMLElement | null;
            if (selectBtn) {
                const courseElement = selectBtn.closest('.course-item, .course-card') as HTMLElement;
                if (courseElement) {
                    try {
                        this.courseController.toggleCourseSelection(courseElement);
                    } catch (error) {
                        console.error('Failed to toggle course selection:', error);
                        this.services.uiStateManager.showErrorMessage('Failed to update course selection. Please try again.');
                    }
                }
            }

            const bookmarkBtn = target.closest('.course-bookmark-btn') as HTMLElement | null;
            if (bookmarkBtn) {
                const courseElement = bookmarkBtn.closest('.course-item, .course-card') as HTMLElement;
                if (courseElement) {
                    this.courseController.toggleCourseBookmark(courseElement);
                }
            }

            if (target.classList.contains('load-more-button')) {
                // Handle Load More button click
                this.handleLoadMoreClick().catch(error => {
                    console.error('Failed to load more courses:', error);
                    this.services.uiStateManager.showErrorMessage('Failed to load more courses. Please try again.');
                });
                return;
            }

            if (target.classList.contains('course-remove-btn')) {
                e.stopPropagation();
                const courseId = (target as HTMLElement).dataset.courseId;

                if (courseId) {
                    const selectedCourse = this.services.profileStateManager.getSelectedCourses().find(sc => sc.course.id === courseId);
                    if (selectedCourse) {
                        this.services.courseSelectionService.unselectCourse(selectedCourse.course).catch(error => {
                            console.error('Failed to unselect course:', error);
                            this.services.uiStateManager.showErrorMessage('Failed to remove course. Please try again.');
                        });
                    }
                }
                return;
            }

            if (target.classList.contains('course-clear-sections-btn')) {
                e.stopPropagation();
                const courseId = (target as HTMLElement).dataset.courseId;

                if (courseId) {
                    const selectedCourse = this.services.profileStateManager.getSelectedCourses().find(sc => sc.course.id === courseId);
                    if (selectedCourse) {
                        this.services.courseSelectionService.clearCourseComponents(selectedCourse.course).catch(error => {
                            console.error('Failed to clear course components:', error);
                            this.services.uiStateManager.showErrorMessage('Failed to clear sections. Please try again.');
                        });
                    }
                }
                return;
            }

            // Handle clicking on schedule course header to open wizard
            if (target.classList.contains('schedule-course-header') || target.closest('.schedule-course-header')) {
                e.stopPropagation();

                if (this.services.uiStateManager.currentPage === 'schedule') {
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
                                const selectedCourses = this.services.courseSelectionService.getSelectedCourses();
                                const existingSelections = selectedCourses.find(sc => sc.course.id === course.id);

                                // Open wizard with existing selections if any
                                this.scheduleController.openComponentWizard(course, existingSelections);
                            }
                        }
                    }
                }
                return;
            }


            if (target.closest('.course-item, .course-card, .selected-course-item') && !target.closest('.course-select-btn') && !target.closest('.course-bookmark-btn') && !target.classList.contains('section-badge') && !target.closest('.course-remove-btn')) {
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
                        this.services.filterService.addFilter('searchText', { query });
                    } else {
                        this.services.filterService.removeFilter('searchText');
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
                this.services.uiStateManager.switchToPage('planner');
            });
        }

        if (scheduleTab) {
            scheduleTab.addEventListener('click', async () => {
                this.services.uiStateManager.switchToPage('schedule');

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
                this.services.uiStateManager.setView('list');
                this.refreshCurrentView();
            });
        }
        
        if (viewGridBtn) {
            viewGridBtn.addEventListener('click', () => {
                this.services.uiStateManager.setView('grid');
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
                if (this.services.filterService.hasFilter('bookmark')) {
                    this.services.filterService.removeFilter('bookmark');
                } else {
                    this.services.filterService.addFilter('bookmark', { showBookmarkedOnly: true });
                }
                this.updateBookmarkFilterButtonState();
            });
        }

        // Clear filters button
        const clearFiltersButton = document.getElementById('clear-filters-btn');
        if (clearFiltersButton) {
            clearFiltersButton.insertAdjacentHTML('afterbegin', getInlineSVG('ERASER', 'eraser-icon'));
            clearFiltersButton.addEventListener('click', () => {
                if (this.services.filterService) {
                    this.services.filterService.clearFilters();
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
                this.scheduleFilterModalController.show();
            });
        }

        // Schedule clear filters button
        const scheduleClearFiltersButton = document.getElementById('schedule-clear-filters-btn');
        if (scheduleClearFiltersButton) {
            scheduleClearFiltersButton.insertAdjacentHTML('afterbegin', getInlineSVG('ERASER', 'eraser-icon'));
            scheduleClearFiltersButton.addEventListener('click', () => {
                if (this.services.filterService) {
                    this.services.filterService.clearFilters();
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
                    this.services.filterService.addFilter('searchText', { query });
                } else {
                    this.services.filterService.removeFilter('searchText');
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
        this.services.profileStateManager.onUndoRedoChange(() => {
            this.updateUndoRedoButtons();
        });

        // Initial button state update
        this.updateUndoRedoButtons();
    }

    /** Compute animation duration scaled by pixel distance (min 0.2s, max 0.5s) */
    private getHeightAnimDuration(fromHeight: number, toHeight: number): number {
        const distance = Math.abs(toHeight - fromHeight);
        // ~2ms per pixel, clamped to [200, 500]ms
        return Math.min(500, Math.max(200, distance * 2)) / 1000;
    }


    private animateTermExpansion(
        courseSections: HTMLElement,
        termBadgesContainer: HTMLElement,
        termSectionsContainers: NodeListOf<HTMLElement>,
        clickedTermContainer: HTMLElement,
        onComplete?: () => void
    ): void {
        const courseItem = courseSections.closest('.course-item') as HTMLElement;

        // 1. Lock course-item at current height, promote to compositor layer
        const currentItemHeight = courseItem.getBoundingClientRect().height;
        courseItem.style.willChange = 'height';
        courseItem.style.height = `${currentItemHeight}px`;
        courseItem.style.overflow = 'hidden';

        // 2. Instantly do the full content swap
        termBadgesContainer.style.display = 'none';
        termSectionsContainers.forEach(c => c.style.display = 'none');

        courseSections.classList.add('expanded');

        // Show clicked container — reset any stale inline styles from prior collapse
        clickedTermContainer.style.cssText = '';
        clickedTermContainer.style.display = 'flex';
        clickedTermContainer.style.maxHeight = 'none';
        clickedTermContainer.style.paddingTop = '0.5rem';

        const sectionBadges = clickedTermContainer.querySelectorAll('.section-badge') as NodeListOf<HTMLElement>;

        sectionBadges.forEach(badge => {
            badge.style.opacity = '0';
            badge.style.transform = 'translateX(-10px)';
            badge.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
        });

        // 3. Measure target height (temporarily unlock to get true content height)
        courseItem.style.height = 'auto';
        const targetItemHeight = courseItem.getBoundingClientRect().height;
        // Re-lock at starting height and force reflow before adding transition
        courseItem.style.height = `${currentItemHeight}px`;
        courseItem.offsetHeight;
        const expandDuration = this.getHeightAnimDuration(currentItemHeight, targetItemHeight);
        courseItem.style.transition = `height ${expandDuration}s ease`;

        // 4. Animate to target height
        requestAnimationFrame(() => {
            courseItem.style.height = `${targetItemHeight}px`;

            // Stagger animate badges in
            const staggerTimers: ReturnType<typeof setTimeout>[] = [];
            sectionBadges.forEach((badge, i) => {
                staggerTimers.push(setTimeout(() => {
                    badge.style.opacity = '1';
                    badge.style.transform = 'translateX(0)';
                }, i * 15));
            });

            // Clean up after transition
            const cleanup = () => {
                // Cancel any pending stagger timeouts first
                staggerTimers.forEach(t => clearTimeout(t));
                courseItem.style.height = '';
                courseItem.style.transition = '';
                courseItem.style.overflow = '';
                courseItem.style.willChange = '';
                // Clean up inline styles so they don't slow down future interactions
                clickedTermContainer.style.transition = '';
                sectionBadges.forEach(badge => {
                    badge.style.cssText = '';
                });
                if (onComplete) onComplete();
            };
            // Wait for both height transition AND all stagger animations to finish
            const staggerEnd = sectionBadges.length * 15 + 200;
            const cleanupDelay = Math.max(expandDuration * 1000, staggerEnd) + 100;
            const onEnd = (e: TransitionEvent) => {
                if (e.propertyName !== 'height') return;
                clearTimeout(fallbackTimer);
                courseItem.removeEventListener('transitionend', onEnd);
                // Delay cleanup until stagger animations are done
                const remaining = staggerEnd - (expandDuration * 1000);
                if (remaining > 0) {
                    setTimeout(cleanup, remaining + 50);
                } else {
                    cleanup();
                }
            };
            courseItem.addEventListener('transitionend', onEnd);
            const fallbackTimer = setTimeout(() => {
                courseItem.removeEventListener('transitionend', onEnd);
                cleanup();
            }, cleanupDelay);
        });

        // Rotate icon
        const termIcon = clickedTermContainer.querySelector('.term-badge.active .term-icon') as HTMLElement;
        if (termIcon) {
            termIcon.style.transition = `transform ${expandDuration}s ease`;
            termIcon.style.transform = 'rotate(45deg)';
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

            // Set display states without animation
            courseSections.classList.add('expanded');
            termBadgesContainer.style.display = 'none';
            termSectionsContainers.forEach(container => {
                container.style.display = 'none';
            });
            expandedTermContainer.style.display = 'flex';
            expandedTermContainer.style.opacity = '1';
            expandedTermContainer.style.maxHeight = 'none';
            expandedTermContainer.style.paddingTop = '0.5rem';
        });
    }

    private processPendingExpansions(): void {
        // Process all queued term expansions with animations
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

            // Use extracted animation function
            this.animateTermExpansion(courseSections, termBadgesContainer, termSectionsContainers, clickedTermContainer);

        });

        // Clear the queue
        this.pendingExpansions = [];
    }

    private refreshCurrentView(): void {
        this.expandedTerms.clear();

        const hasFilters = !this.services.filterService.isEmpty();

        // Check if department filter is active
        const departmentFilter = this.services.filterService.getActiveFilters()
            .find(f => f.id === 'department');
        const departmentCriteria = departmentFilter?.criteria as { departments?: string[] } | undefined;
        const activeDepartmentIds = departmentCriteria?.departments || [];

        // Start a new render operation with cancellation support
        const cancellationToken = this.services.operationManager.startOperation('render', 'New render requested');

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

            coursesToDisplay = this.services.filterService.filterCourses(baseCourses);

        } else {
            // No filters - show all courses
            coursesToDisplay = this.getAllCourses();
        }

        // Display courses with cancellation support
        this.displayCoursesWithCancellation(coursesToDisplay, cancellationToken);

        // Update filter button appearance and sync search input
        this.updateFilterButtonState();
        this.syncSearchInputFromFilters();
    }
    
    private async displayCoursesWithCancellation(coursesToDisplay: Course[], cancellationToken: CancellationToken): Promise<void> {
        try {
            // Pass cancellation token to the progressive renderer
            await this.courseController.displayCoursesWithCancellation(
                coursesToDisplay, 
                this.services.uiStateManager.currentView,
                cancellationToken
            );
            
            // Mark operation as complete
            this.services.operationManager.completeOperation('render');
            
        } catch (error) {
            if ((error as Error).name === 'CancellationError') {
                // Render was cancelled, not an error
                return;
            }
            console.error('Error displaying courses:', error);
            this.services.operationManager.completeOperation('render');
        }
    }

    private updateFilterButtonState(): void {
        const filterButton = document.getElementById('filter-btn');
        if (filterButton && this.services.filterService) {
            const hasActiveFilters = !this.services.filterService.isEmpty();
            const filterCount = this.services.filterService.getFilterCount();

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
        if (clearFiltersButton && this.services.filterService) {
            const hasActiveFilters = !this.services.filterService.isEmpty();

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
        if (button && this.services.filterService) {
            const isActive = this.services.filterService.hasFilter('bookmark');
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
        if (scheduleFilterButton && this.services.filterService) {
            const hasActiveFilters = !this.services.filterService.isEmpty();
            const filterCount = this.services.filterService.getFilterCount();

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
        if (scheduleClearFiltersButton && this.services.filterService) {
            const hasActiveFilters = !this.services.filterService.isEmpty();

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
            this.schedulePickerModal = new SchedulePickerModal(this.services.modalService, this.services.scheduleManagementService, this.services.tutorial);
        }
        this.schedulePickerModal.show();
    }

    private async updateSchedulePickerButton(): Promise<void> {
        const labelElement = document.getElementById('schedule-picker-label');
        if (labelElement) {
            // Wait for initialization if needed
            await this.services.scheduleManagementService.initialize();

            const activeSchedule = this.services.scheduleManagementService.getActiveSchedule();
            if (activeSchedule) {
                labelElement.textContent = activeSchedule.name;
            }
        }
    }


    private previousSelectedCoursesCount = 0;
    private previousSelectedCoursesMap = new Map<string, SelectionSnapshot>();

    private setupScheduleChangeListener(): void {
        this.services.scheduleManagementService.onActiveScheduleChange((_activeSchedule, event) => {
            this.updateSchedulePickerButton();

            // Skip reloading events if this was just an exclusion change
            // (the UI already updated optimistically, no need to refetch)
            if (event?.source === 'calendar-event-exclusion') {
                return;
            }

            const activeSchedule = this.services.scheduleManagementService.getActiveSchedule();
            if (activeSchedule) {
                this.scheduleController.loadExternalEvents(activeSchedule);
            }
        });
        this.updateSchedulePickerButton();
    }

    private setupCourseSelectionListener(): void {
        this.services.courseSelectionService.onSelectionChangeWithType((event) => {
            const selectedCourses = event.selectedCourses;
            const currentCount = selectedCourses.length;
            const isCoursesAddedOrRemoved = currentCount !== this.previousSelectedCoursesCount;
            
            // Handle schedule changes and data loads with full refresh
            const requiresFullRefresh = event.type === 'data_loaded'
                || event.type === 'selection_cleared'
                || event.type === 'components_cleared';

            if (requiresFullRefresh) {
                this.courseController.refreshCourseSelectionUI(selectedCourses, this.previousSelectedCoursesMap);
                this.courseController.displaySelectedCourses();
                this.scheduleController.displayScheduleSelectedCourses();
                if (this.services.uiStateManager.currentPage === 'schedule') {
                    this.scheduleController.renderScheduleGrids();
                }
                this.updateSelectedCoursesState(selectedCourses);
                return;
            }

            if (event.type === 'components_changed' && event.affectedCourseIds) {
                if (!event.skipCourseSidebarUpdate) {
                    this.courseController.refreshCourseSelectionUI(selectedCourses, this.previousSelectedCoursesMap);
                    this.courseController.displaySelectedCourses();
                }
                this.scheduleController.displayScheduleSelectedCourses();
                if (this.services.uiStateManager.currentPage === 'schedule') {
                    // If any affected course has no sections (cleared), we can't determine
                    // which terms were affected — fall back to full grid re-render
                    const needsFullRefresh = event.affectedCourseIds.some(id => {
                        const sc = selectedCourses.find(c => c.course.id === id);
                        return sc && !sc.selectedLecture && !sc.selectedDiscussion && !sc.selectedLab;
                    });
                    if (needsFullRefresh) {
                        this.scheduleController.renderScheduleGrids();
                    } else {
                        this.scheduleController.renderAffectedTerms(event.affectedCourseIds);
                    }
                }
                this.updateSelectedCoursesState(selectedCourses);
                return;
            }
            
            // Create current state map for comparison
            const currentCoursesMap = new Map<string, SelectionSnapshot>();
            selectedCourses.forEach(sc => {
                currentCoursesMap.set(sc.course.id, {
                    lecture: sc.selectedLecture?.number || null,
                    discussion: sc.selectedDiscussion?.number || null,
                    lab: sc.selectedLab?.number || null
                });
            });

            if (isCoursesAddedOrRemoved) {
                const currentIds = new Set(selectedCourses.map(sc => sc.course.id));
                const previousIds = new Set(this.previousSelectedCoursesMap.keys());

                for (const sc of selectedCourses) {
                    if (!previousIds.has(sc.course.id)) {
                        this.courseController.addSelectedCourseToSidebar(sc.course);
                        this.courseController.updateCourseUIById(sc.course.id, true);
                    }
                }
                for (const id of previousIds) {
                    if (!currentIds.has(id)) {
                        this.courseController.removeSelectedCourseFromSidebar(id);
                        this.courseController.updateCourseUIById(id, false);
                    }
                }

                this.scheduleController.displayScheduleSelectedCourses();

                if (this.services.uiStateManager.currentPage === 'schedule') {
                    this.scheduleController.renderScheduleGrids();
                }
            } else {
                // Check if only section selections changed
                let sectionSelectionsChanged = false;
                for (const [courseId, currentComponents] of currentCoursesMap) {
                    const previousComponents = this.previousSelectedCoursesMap.get(courseId);
                    const hasChanged = !previousComponents ||
                        previousComponents.lecture !== currentComponents.lecture ||
                        previousComponents.discussion !== currentComponents.discussion ||
                        previousComponents.lab !== currentComponents.lab;

                    if (hasChanged) {
                        sectionSelectionsChanged = true;

                        // Update visual state for this course
                        const selectedCourse = selectedCourses.find(sc => sc.course.id === courseId);
                        if (selectedCourse && selectedCourse.selectedLecture) {
                            this.scheduleController.updateSectionButtonStates(selectedCourse.course, selectedCourse.selectedLecture.number);
                        }
                    }
                }
                
                // Update schedule grids if any sections changed
                if (sectionSelectionsChanged && this.services.uiStateManager.currentPage === 'schedule') {
                    this.scheduleController.renderScheduleGrids();
                }
            }
            
            // Update tracking state
            this.updateSelectedCoursesState(selectedCourses);
        });
    }

    private updateSelectedCoursesState(selectedCourses: SelectedCourse[]): void {
        this.previousSelectedCoursesCount = selectedCourses.length;
        this.previousSelectedCoursesMap = new Map();
        selectedCourses.forEach(sc => {
            this.previousSelectedCoursesMap.set(sc.course.id, {
                lecture: sc.selectedLecture?.number || null,
                discussion: sc.selectedDiscussion?.number || null,
                lab: sc.selectedLab?.number || null
            });
        });
    }

    private handleUndo(): void {
        this.services.profileStateManager.undo().then(() => {
            this.refreshUI();
        }).catch(error => {
            console.error('Undo failed:', error);
            this.services.uiStateManager.showErrorMessage('Failed to undo. Please try again.');
        });
    }

    private handleRedo(): void {
        this.services.profileStateManager.redo().then(() => {
            this.refreshUI();
        }).catch(error => {
            console.error('Redo failed:', error);
            this.services.uiStateManager.showErrorMessage('Failed to redo. Please try again.');
        });
    }

    private refreshUI(): void {
        this.courseController.displaySelectedCourses();
        this.scheduleController.displayScheduleSelectedCourses();

        if (this.services.uiStateManager.currentPage === 'schedule') {
            this.scheduleController.renderScheduleGrids();
        } else {
            this.refreshCurrentView();
        }
    }

    private updateUndoRedoButtons(): void {
        const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
        const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement;

        if (undoBtn) {
            undoBtn.disabled = !this.services.profileStateManager.canUndo();
        }

        if (redoBtn) {
            redoBtn.disabled = !this.services.profileStateManager.canRedo();
        }
    }

    /**
     * Efficiently sync UI for initially selected courses without global refresh
     */
    private syncInitialCourseSelectionUI(): void {
        const selectedCourses = this.services.courseSelectionService.getSelectedCourses();
        
        // Use targeted updates for each selected course
        selectedCourses.forEach(selectedCourse => {
            this.courseController.updateCourseUIById(selectedCourse.course.id, true);
        });
        
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
                id: 'settings-theme-btn',
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
                checkDisabled: () => !this.services.profileStateManager.canUndo()
            },
            {
                icon: 'ARROW_FORWARD_UP',
                label: 'Redo',
                id: 'settings-redo-btn',
                action: () => {
                    this.handleRedo();
                    this.closeSettingsMenu();
                },
                checkDisabled: () => !this.services.profileStateManager.canRedo()
            }
        ];

        menuItems.forEach(item => {
            const menuItem = document.createElement('button');
            menuItem.className = 'settings-menu-item';
            if (item.id) menuItem.id = item.id;

            // Add icon
            menuItem.insertAdjacentHTML('afterbegin', getInlineSVG(item.icon as IconName, 'menu-item-icon'));

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
                if (undoBtn) undoBtn.disabled = !this.services.profileStateManager.canUndo();
                if (redoBtn) redoBtn.disabled = !this.services.profileStateManager.canRedo();
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
        new ResizablePanel({
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
        const currentThemeId = this.services.themeManager.getCurrentThemeId();

        // Toggle between light and dark themes
        if (currentThemeId === 'wpi-dark') {
            this.services.themeManager.setTheme('wpi-light');
        } else {
            this.services.themeManager.setTheme('wpi-dark');
        }
    }

    public getModalService(): ModalService {
        return this.services.modalService;
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
            const searchTextFilter = this.services.filterService.getActiveFilters().find(f => f.id === 'searchText');
            const searchCriteria = searchTextFilter?.criteria as { query?: string } | undefined;
            const currentQuery = searchCriteria?.query || '';
            if (searchInput.value !== currentQuery) {
                searchInput.value = currentQuery;
            }
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
            const currentView = this.services.uiStateManager.currentView;
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