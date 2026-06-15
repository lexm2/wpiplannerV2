import type { WizardStep } from '../../types/uiState'
import { uiState } from '../../services/ui/uiState.svelte'
import { Course, Department } from '../../types/types'
import { SelectedCourse } from '../../types/schedule'
import { ThemeSelector } from '../components/ThemeSelector'
import { SchedulePickerModal } from '../components/SchedulePickerModal'
import { mount } from 'svelte'
import DepartmentSidebar from '../../svelte/DepartmentSidebar.svelte'
import UndoRedoButtons from '../../svelte/UndoRedoButtons.svelte'
import ViewToggle from '../../svelte/ViewToggle.svelte'
import { CourseController } from './CourseController'
import { ScheduleController } from './ScheduleController'
import { SectionInfoModalController } from './SectionInfoModalController'
import { InfoModalController } from './InfoModalController'
import { FilterModalController } from './FilterModalController'
import { getInlineSVG, type IconName } from '../../utils/iconPaths'
import { getAvailableProfessors } from '../../utils/searchUtils'
import { ResizablePanel } from '../components/ResizablePanel'
import { SwipeGestureHandler } from '../utils/SwipeGestureHandler'
import { DeviceDetection } from '../../utils/deviceDetection'
import { DebouncedOperation, CancellationToken } from '../../utils/RequestCancellation'
import { CourseColorService } from '../../services/scheduling/CourseColorService'
import { AutoScheduleOrchestrator } from '../../services/scheduling/AutoScheduleOrchestrator'
import { AppBootstrap } from '../../bootstrap/AppBootstrap'
import type { ServiceContainer } from '../../bootstrap/ServiceContainer'
import { watch } from '../../svelte/reactivity.svelte'
import { appState } from '../../core/state/appState.svelte'
import type { ModalService } from '../../services/ui/ModalService'
import type { SelectionSnapshot } from '../../types/scheduling'

/**
 * UI controller managing DOM event binding, view refreshing, and sub-controller coordination
 */
export class MainController {
    private services: ServiceContainer;
    private schedulePickerModal: SchedulePickerModal | null = null;
    private themeSelector: ThemeSelector;
    private courseController: CourseController;
    private scheduleController: ScheduleController;
    private sectionInfoModalController: SectionInfoModalController;
    private filterModalController: FilterModalController;
    private scheduleFilterModalController: FilterModalController;
    private debouncedSearch: DebouncedOperation;
    private colorService: CourseColorService;
    private autoScheduleOrchestrator: AutoScheduleOrchestrator;
    private allDepartments: Department[] = [];
    private professorSearchMode = false;
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
        this.courseController = new CourseController(courseSelectionService, courseDataService);
        this.scheduleController = new ScheduleController(courseSelectionService, this.colorService, this.autoScheduleOrchestrator);
        this.sectionInfoModalController = new SectionInfoModalController(modalService, uiStateManager);
        new InfoModalController(modalService, uiStateManager);
        this.filterModalController = new FilterModalController(modalService, uiStateManager);
        this.scheduleFilterModalController = new FilterModalController(modalService, uiStateManager);

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
        this.filterModalController.setProfileStateManager(services.profileStateManager);

        // Connect schedule filter service to controllers
        this.scheduleFilterModalController.setFilterService(filterService);
        this.scheduleFilterModalController.setCourseSelectionService(courseSelectionService);
        this.scheduleFilterModalController.setAutoScheduleOrchestrator(this.autoScheduleOrchestrator);
        this.scheduleFilterModalController.setProfileStateManager(services.profileStateManager);
        this.scheduleController.setCourseDataService(courseDataService);
        this.scheduleController.setConflictDetector(conflictDetector);
        this.scheduleController.setFilterService(filterService);

        // Set modal controllers for ScheduleController
        this.scheduleController.setSectionInfoModalController(this.sectionInfoModalController);
        this.scheduleController.setModalService(modalService);
        this.scheduleController.setUIStateManager(uiStateManager);

        // Set up schedule update callback for calendar event exclusions
        this.scheduleController.setScheduleUpdateCallback((scheduleId, updates) => {
            profileStateManager.updateSchedule(scheduleId, updates, 'calendar-event-exclusion');
        });

        // Mount the department sidebar (Svelte). It reads appState.loadedDepartments
        // and the reactive filter state directly, so it needs no imperative wiring.
        const deptListEl = document.getElementById('department-list');
        if (deptListEl) {
            deptListEl.innerHTML = '';
            mount(DepartmentSidebar, { target: deptListEl, props: { filterService } });
        }

        // Mount the undo/redo buttons (Svelte). The wrapper holds exactly these
        // two buttons, so clearing + mounting is safe. The component reads
        // appState.undoRedoGeneration to keep its disabled state in sync —
        // replacing MainController's imperative updateUndoRedoButtons()/watch().
        // Same ids/classes/titles are preserved so the tutorial and
        // SchedulePickerModal getElementById(...).click() shims keep working.
        const undoRedoEl = document.querySelector('.undo-redo-controls');
        if (undoRedoEl) {
            undoRedoEl.innerHTML = '';
            mount(UndoRedoButtons, {
                target: undoRedoEl,
                props: {
                    profileStateManager: services.profileStateManager,
                    onUndo: () => this.handleUndo(),
                    onRedo: () => this.handleRedo()
                }
            });
        }

        // Mount the list/grid view toggle (Svelte). It reads uiState.currentView
        // (a rune) for its reactive active/btn-primary/btn-secondary classes —
        // replacing UIStateManager.applyViewEffects() and the imperative click
        // wiring below. Same ids/base classes are preserved. onSelect runs
        // refreshCurrentView so the still-vanilla course list re-renders.
        const viewToggleEl = document.getElementById('view-toggle');
        if (viewToggleEl) {
            mount(ViewToggle, {
                target: viewToggleEl,
                props: {
                    uiStateManager: services.uiStateManager,
                    onSelect: () => this.refreshCurrentView()
                }
            });
        }

        // Set up course data event subscriptions via AppBootstrap
        AppBootstrap.setupCourseDataSubscriptions(services, {
            setAllDepartments: (departments) => {
                this.allDepartments = departments;
            },
            onDataLoaded: (departments) => {
                this.filterModalController.setCourseData(departments);
                this.scheduleFilterModalController.setCourseData(departments);
                this.courseController.setAllDepartments(departments);
            },
            onDataRefreshed: (departments) => {
                this.filterModalController.setCourseData(departments);
                this.scheduleFilterModalController.setCourseData(departments);
                this.courseController.setAllDepartments(departments);
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

        watch(
            () => filterService.getActiveFilters(),
            () => {
                this.refreshCurrentView();
                this.scheduleController.applyFiltersAndRefresh();
            },
        );

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

    openWizardForCourse(courseId: string, initialStep?: WizardStep): void {
        const selectedCourses = this.services.courseSelectionService.getSelectedCourses();
        const selected = selectedCourses.find(sc => sc.course.id === courseId);
        if (!selected) return;
        this.scheduleController.openComponentWizard(selected.course, selected, initialStep);
    }

    jumpWizardToStep(step: WizardStep): void {
        this.scheduleController.jumpWizardToStep(step);
    }

    private async init(): Promise<void> {
        // The DepartmentSidebar component shows its own loading state until
        // appState.loadedDepartments is populated.
        try {
            await AppBootstrap.initializeAsyncServices(this.services);
            this.themeSelector.initializeTheme();

            // Set "All Departments" as the default selection on startup
            this.initializeDefaultDepartmentView();

            this.setupEventListeners();
            this.setupCourseSelectionListener();
            this.setupPageNavigationListener();
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
        // Department selection is handled inside the DepartmentSidebar Svelte component.
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

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
        const searchClearBtn = document.getElementById('search-clear-btn') as HTMLButtonElement;
        const searchModeBtn = document.getElementById('search-mode-btn') as HTMLButtonElement;
        const professorDropdown = document.getElementById('search-professor-dropdown') as HTMLDivElement;

        if (professorDropdown) {
            professorDropdown.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains('professor-option') && searchInput) {
                    searchInput.value = target.dataset.professor!;
                    professorDropdown.style.display = 'none';
                    searchInput.dispatchEvent(new Event('input'));
                    searchInput.focus();
                }
            });
        }

        if (searchModeBtn) {
            searchModeBtn.insertAdjacentHTML('beforeend', getInlineSVG('SCHOOL', 'school-icon'));
            searchModeBtn.addEventListener('click', () => {
                this.professorSearchMode = !this.professorSearchMode;
                searchModeBtn.innerHTML = '';
                searchModeBtn.insertAdjacentHTML('beforeend',
                    this.professorSearchMode ? getInlineSVG('SCHOOL_FULL', 'school-full-icon') : getInlineSVG('SCHOOL', 'school-icon')
                );
                searchModeBtn.classList.toggle('active', this.professorSearchMode);
                if (professorDropdown) professorDropdown.style.display = 'none';
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.placeholder = this.professorSearchMode ? 'Search professors...' : 'Search courses...';
                    searchInput.dispatchEvent(new Event('input'));
                }
            });
        }

        if (searchClearBtn) {
            searchClearBtn.insertAdjacentHTML('beforeend', getInlineSVG('X', 'x-icon'));
            searchClearBtn.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input'));
                    searchInput.focus();
                }
                searchClearBtn.hidden = true;
                this.professorSearchMode = false;
                if (professorDropdown) professorDropdown.style.display = 'none';
                if (searchModeBtn) {
                    searchModeBtn.innerHTML = '';
                    searchModeBtn.insertAdjacentHTML('beforeend', getInlineSVG('SCHOOL', 'school-icon'));
                    searchModeBtn.classList.remove('active');
                }
                if (searchInput) searchInput.placeholder = 'Search courses...';
            });
        }

        if (searchInput) {
            searchInput.addEventListener('blur', () => {
                setTimeout(() => { if (professorDropdown) professorDropdown.style.display = 'none'; }, 150);
            });

            searchInput.addEventListener('input', () => {
                const query = searchInput.value;
                if (searchClearBtn) searchClearBtn.hidden = query === '';

                if (this.professorSearchMode && professorDropdown) {
                    if (query.length > 0) {
                        const matches = getAvailableProfessors(this.getAllCourses())
                            .filter(p => p.toLowerCase().includes(query.toLowerCase()))
                            .slice(0, 10);
                        professorDropdown.innerHTML = matches
                            .map(p => `<div class="professor-option" data-professor="${p}">${p}</div>`)
                            .join('');
                        professorDropdown.style.display = matches.length > 0 ? 'block' : 'none';
                    } else {
                        professorDropdown.style.display = 'none';
                    }
                }

                // Use debounced operation for search to prevent excessive filtering
                this.debouncedSearch.execute(async (cancellationToken) => {
                    cancellationToken.throwIfCancelled();

                    // Only trim for the check, but pass the original query with spaces
                    if (query.trim().length > 0) {
                        this.services.filterService.addFilter('searchText', { query, professorOnly: this.professorSearchMode });
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

                this.scheduleController.displayScheduleSelectedCourses();
                this.scheduleController.renderScheduleGrids();
            });
        }

        // View toggle buttons are rendered by the ViewToggle Svelte component
        // (mounted into #view-toggle); it calls setView + refreshCurrentView.

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
                    const activeYear = this.services.profileStateManager.getActiveSchedule()?.year;
                    this.services.filterService.resetFilters(activeYear);
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

        // Undo/Redo buttons are rendered by the UndoRedoButtons Svelte component
        // (mounted in the constructor). Icon injection, click handlers, and
        // disabled-state sync live there.

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
                const targetId = activeDepartmentIds[0].toLowerCase();
                const dept = this.allDepartments.find(d => d.abbreviation.toLowerCase() === targetId);
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
            const activeYear = this.services.profileStateManager.getActiveSchedule()?.year;
            const hasNonDefault = this.services.filterService.hasNonDefaultFilters(activeYear);
            const filterCount = this.services.filterService.getFilterCount();

            if (hasNonDefault) {
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
            const activeYear = this.services.profileStateManager.getActiveSchedule()?.year;
            const hasNonDefault = this.services.filterService.hasNonDefaultFilters(activeYear);

            if (hasNonDefault) {
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
            const activeYear = this.services.profileStateManager.getActiveSchedule()?.year;
            const hasNonDefault = this.services.filterService.hasNonDefaultFilters(activeYear);
            const filterCount = this.services.filterService.getFilterCount();

            if (hasNonDefault) {
                scheduleFilterButton.classList.add('active');
                scheduleFilterButton.title = `${filterCount} filter${filterCount === 1 ? '' : 's'} active - Click to modify`;
            } else {
                scheduleFilterButton.classList.remove('active');
                scheduleFilterButton.title = 'Filter selected courses';
            }
        }
    }

    openSchedulePicker(): void {
        if (!this.schedulePickerModal) {
            this.schedulePickerModal = new SchedulePickerModal(this.services.modalService, this.services.scheduleManagementService, this.services.tutorial, this.services.uiStateManager);
        }
        this.schedulePickerModal.show();
    }

    navigateSchedulePickerToTab(tab: 'schedules' | 'settings'): void {
        this.schedulePickerModal?.navigateToTab(tab);
    }

    openFilterModal(): void {
        this.filterModalController.show();
    }

    openAutoSchedule(): void {
        this.scheduleController.openAutoSchedule();
    }

    openAutoScheduleIntro(): void {
        this.scheduleController.openAutoScheduleIntro();
    }

    openAutoScheduleFilter(): void {
        this.scheduleController.openAutoScheduleFilter();
    }

    updateAutoScheduleIntroTerms(preferences: Record<string, string[]>): void {
        this.scheduleController.updateAutoScheduleIntroTerms(preferences);
    }

    refreshAutoScheduleFilterUI(): void {
        this.scheduleController.refreshAutoScheduleFilterUI();
    }

    refreshPlannerFilterUI(): void {
        this.filterModalController.refreshFilterUI();
    }

    syncCourseSelectionUI(): void {
        this.courseController.syncCourseSelectionState();
        this.courseController.displaySelectedCourses();
    }

    runAutoSchedule(): void {
        this.scheduleController.runAutoSchedule();
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
        // React to active-schedule (re)activation via runes.
        watch(() => appState.activationGeneration, () => {
            this.updateSchedulePickerButton();

            // Skip reloading events if this was just an exclusion change
            // (the UI already updated optimistically, no need to refetch)
            if (appState.activationSource === 'calendar-event-exclusion') {
                return;
            }

            const activeSchedule = this.services.scheduleManagementService.getActiveSchedule();
            if (activeSchedule) {
                this.scheduleController.loadExternalEvents(activeSchedule);

                // Sync year filter to match the newly activated schedule
                if (activeSchedule.year !== undefined) {
                    this.services.filterService.addFilter('academicYear', { year: activeSchedule.year });
                } else {
                    const defaultYear = this.services.profileStateManager.getDefaultAcademicYear();
                    if (defaultYear !== undefined) {
                        this.services.filterService.addFilter('academicYear', { year: defaultYear });
                    }
                }
                this.updateFilterButtonState();
                this.updateClearFiltersButtonState();
            }
        });
        this.updateSchedulePickerButton();
    }

    private setupPageNavigationListener(): void {
        let prevPage = uiState.currentPage;
        watch(() => uiState.currentPage, () => {
            const page = uiState.currentPage;
            if (page === 'planner' && prevPage !== 'planner') {
                this.courseController.syncCourseSelectionState();
            }
            if (page === 'schedule' && prevPage !== 'schedule') {
                this.resetSearchAndDepartmentFilters();
            }
            prevPage = page;
        });
    }

    private setupCourseSelectionListener(): void {
        // Refresh incrementally whenever the selected courses change (runes).
        watch(() => appState.selectedById, () => this.refreshSelectionUI());
    }

    private refreshSelectionUI(): void {
        const selectedCourses = this.services.profileStateManager.getSelectedCourses();
        const currentIds = new Set(selectedCourses.map(sc => sc.course.id));
        const previousIds = new Set(this.previousSelectedCoursesMap.keys());
        const onSchedule = this.services.uiStateManager.currentPage === 'schedule';

        // Added / removed courses → incremental sidebar + course-list updates
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

        // Section changes on existing courses → reflect section-button state
        for (const sc of selectedCourses) {
            const prev = this.previousSelectedCoursesMap.get(sc.course.id);
            if (prev && sc.selectedLecture && prev.lecture !== sc.selectedLecture.number) {
                this.scheduleController.updateSectionButtonStates(sc.course, sc.selectedLecture.number);
            }
        }

        this.scheduleController.displayScheduleSelectedCourses();
        if (onSchedule) {
            this.scheduleController.renderScheduleGrids();
        }
        this.updateSelectedCoursesState(selectedCourses);
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

    private resetSearchAndDepartmentFilters(): void {
        this.services.filterService.removeFilter('searchText');
        this.professorSearchMode = false;
        const searchInput = document.getElementById('search-input') as HTMLInputElement;
        const searchClearBtn = document.getElementById('search-clear-btn') as HTMLButtonElement;
        const searchModeBtn = document.getElementById('search-mode-btn') as HTMLButtonElement;
        const professorDropdown = document.getElementById('search-professor-dropdown') as HTMLDivElement;
        if (searchInput) { searchInput.value = ''; searchInput.placeholder = 'Search courses...'; }
        if (searchClearBtn) searchClearBtn.hidden = true;
        if (professorDropdown) professorDropdown.style.display = 'none';
        if (searchModeBtn) {
            searchModeBtn.innerHTML = '';
            searchModeBtn.insertAdjacentHTML('beforeend', getInlineSVG('SCHOOL', 'school-icon'));
            searchModeBtn.classList.remove('active');
        }
        // Reset department selection to "All"; the sidebar reflects this reactively.
        this.services.filterService.removeFilter('department');
    }

    private syncSearchInputFromFilters(): void {
        const searchInput = document.getElementById('search-input') as HTMLInputElement;
        if (searchInput) {
            const searchTextFilter = this.services.filterService.getActiveFilters().find(f => f.id === 'searchText');
            const searchCriteria = searchTextFilter?.criteria as { query?: string } | undefined;
            const currentQuery = searchCriteria?.query || '';
            if (searchInput.value !== currentQuery) {
                searchInput.value = currentQuery;
                const searchClearBtn = document.getElementById('search-clear-btn') as HTMLButtonElement;
                if (searchClearBtn) searchClearBtn.hidden = currentQuery === '';
                if (currentQuery === '') {
                    const searchModeBtn = document.getElementById('search-mode-btn') as HTMLButtonElement;
                    if (searchModeBtn && searchModeBtn.classList.contains('active')) {
                        searchModeBtn.innerHTML = '';
                        searchModeBtn.insertAdjacentHTML('beforeend', getInlineSVG('SCHOOL', 'school-icon'));
                        searchModeBtn.classList.remove('active');
                        searchInput.placeholder = 'Search courses...';
                    }
                }
            }
        }
    }

    private initializeDefaultDepartmentView(): void {
        // No department filter on startup → the sidebar shows "All Departments"
        // as active; trigger a refresh to show all courses.
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