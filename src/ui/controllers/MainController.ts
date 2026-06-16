import type { PageId, WizardStep } from '../../types/uiState'
import { uiState } from '../../services/ui/uiState.svelte'
import { Course, Department } from '../../types/types'
import { SelectedCourse } from '../../types/schedule'
import { mount } from 'svelte'
import DepartmentSidebar from '../../svelte/DepartmentSidebar.svelte'
import ThemeSelector from '../../svelte/ThemeSelector.svelte'
import UndoRedoButtons from '../../svelte/UndoRedoButtons.svelte'
import ViewToggle from '../../svelte/ViewToggle.svelte'
import PageTabs from '../../svelte/PageTabs.svelte'
import FilterButtons from '../../svelte/FilterButtons.svelte'
import ClearAllSectionsButton from '../../svelte/ClearAllSectionsButton.svelte'
import { localEventService } from '../../services/scheduling/localEventService'
import SearchBar from '../../svelte/SearchBar.svelte'
import CourseList from '../../svelte/CourseList.svelte'
import SelectedCoursesPanel from '../../svelte/SelectedCoursesPanel.svelte'
import CourseDescription from '../../svelte/CourseDescription.svelte'
import AutoScheduleControls from '../../svelte/AutoScheduleControls.svelte'
import ScheduleSidebar from '../../svelte/ScheduleSidebar.svelte'
import CalendarEventsButton from '../../svelte/CalendarEventsButton.svelte'
import WizardHost from '../../svelte/WizardHost.svelte'
import ScheduleGrids from '../../svelte/schedule/ScheduleGrids.svelte'
import ModalLayer from '../../svelte/modals/ModalLayer.svelte'
import { modalState } from '../../svelte/modals/modalState.svelte'
import { ScheduleController } from './ScheduleController'
import { getInlineSVG, type IconName } from '../../utils/iconPaths'
import { ResizablePanel } from '../components/ResizablePanel'
import { SwipeGestureHandler } from '../utils/SwipeGestureHandler'
import { DeviceDetection } from '../../utils/deviceDetection'
import { DebouncedOperation } from '../../utils/RequestCancellation'
import { CourseColorService } from '../../services/scheduling/CourseColorService'
import { AutoScheduleOrchestrator } from '../../services/scheduling/AutoScheduleOrchestrator'
import { calendarEventProvider } from '../../services/scheduling/calendarEventProvider'
import { AppBootstrap } from '../../bootstrap/AppBootstrap'
import type { ServiceContainer } from '../../bootstrap/ServiceContainer'
import { watch } from '../../svelte/reactivity.svelte'
import { appState } from '../../core/state/appState.svelte'
import type { SelectionSnapshot } from '../../types/scheduling'

/**
 * UI controller managing DOM event binding, view refreshing, and sub-controller coordination
 */
export class MainController {
    private services: ServiceContainer;
    private scheduleController: ScheduleController;
    private debouncedSearch: DebouncedOperation;
    private colorService: CourseColorService;
    private autoScheduleOrchestrator: AutoScheduleOrchestrator;
    private allDepartments: Department[] = [];


    constructor(services: ServiceContainer) {
        this.services = services;

        const {
            profileStateManager, courseDataService, courseSelectionService,
            conflictDetector, filterService,
            operationManager, uiStateManager
        } = services;

        this.debouncedSearch = new DebouncedOperation(operationManager, 'search', 300);

        // Initialize extracted services
        this.colorService = new CourseColorService(courseSelectionService);
        this.autoScheduleOrchestrator = new AutoScheduleOrchestrator(courseSelectionService, filterService);

        // Initialize controllers
        this.scheduleController = new ScheduleController(courseSelectionService, this.colorService, this.autoScheduleOrchestrator);

        // The planner/schedule filter modal is now the FilterModal Svelte component
        // in ModalLayer (mounted below) — opened via uiState.openModals, services
        // passed as ModalLayer props. No imperative controller instances here.
        this.scheduleController.setCourseDataService(courseDataService);
        this.scheduleController.setConflictDetector(conflictDetector);
        this.scheduleController.setFilterService(filterService);

        // Set modal controllers for ScheduleController
        this.scheduleController.setUIStateManager(uiStateManager);

        // Local calendar-event CRUD lives in the standalone localEventService,
        // which reads appState.activeSchedule directly and persists via
        // profileStateManager.updateSchedule (replacing ScheduleController's
        // currentSchedule + setScheduleUpdateCallback wiring).
        localEventService.init(profileStateManager, uiStateManager);

        // Mount the department sidebar (Svelte). It reads appState.loadedDepartments
        // and the reactive filter state directly, so it needs no imperative wiring.
        const deptListEl = document.getElementById('department-list');
        if (deptListEl) {
            deptListEl.innerHTML = '';
            mount(DepartmentSidebar, { target: deptListEl, props: { filterService } });
        }

        // Mount the undo/redo buttons (Svelte). The wrapper holds exactly these
        // two buttons, so clearing + mounting is safe. The component reads
        // appState.canUndo/canRedo to keep its disabled state in sync —
        // replacing MainController's imperative updateUndoRedoButtons()/watch().
        // Same ids/classes/titles are preserved so the tutorial and
        // SchedulePicker settings getElementById(...).click() shims keep working.
        const undoRedoEl = document.querySelector('.undo-redo-controls');
        if (undoRedoEl) {
            undoRedoEl.innerHTML = '';
            mount(UndoRedoButtons, {
                target: undoRedoEl,
                props: {
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

        // Mount the planner filter controls (Svelte): clear-filters, filter, and
        // bookmark-filter buttons. They read filterService.getActiveFilters()
        // (a SvelteMap) + appState.activeSchedule (a rune) for their reactive
        // active class, title text, icon swap, and clear-button show/hide+disabled
        // — replacing updateFilterButtonState/updateBookmarkFilterButtonState/
        // updateClearFiltersButtonState, the setTimeout(100) initializer, and the
        // imperative click wiring below. Same ids/classes/titles are preserved so
        // the tutorial's `#filter-btn` selector keeps working. onFilter opens the
        // planner filter modal (the old #filter-btn handler body). The
        // schedule-filter button is intentionally NOT migrated here.
        const filterButtonsHost = document.getElementById('filter-buttons-host');
        if (filterButtonsHost) {
            mount(FilterButtons, {
                target: filterButtonsHost,
                props: {
                    filterService,
                    onFilter: () => this.openFilterModal()
                }
            });
        }

        // Mount the course search bar (Svelte): search input + professor-mode
        // toggle + clear button + professor autocomplete dropdown. The input's
        // display value is local $state; the `searchText` filter only updates on
        // the debounced write, and an internal $effect adopts EXTERNAL filter
        // changes (page-switch reset / FilterModal edits) back into the input —
        // replacing the imperative #search-input/#search-mode-btn/#search-clear-btn
        // wiring and syncSearchInputFromFilters(). Same ids/classes are preserved.
        // onModalSync forwards committed queries to the still-vanilla FilterModal
        // (main->modal); the modal->main direction is handled by the shared
        // `searchText` filter that the $effect watches.
        const searchInputWrapper = document.querySelector('.search-input-wrapper');
        if (searchInputWrapper) {
            searchInputWrapper.innerHTML = '';
            mount(SearchBar, {
                target: searchInputWrapper,
                props: {
                    filterService,
                    debouncedSearch: this.debouncedSearch,
                    onModalSync: (q: string) => this.syncModalSearchInput(q)
                }
            });
        }

        // Mount the course list (Svelte) into #course-container. It derives the
        // displayed courses from appState.loadedDepartments + the reactive filter
        // store (replicating refreshCurrentView's single-department/all base +
        // filterService.filterCourses), owns pagination (load-more), term-badge
        // expansion (a slide transition replacing the old FLIP height animation),
        // and the select/bookmark buttons (which reflect appState.selectedById /
        // bookmarkedIds reactively). Clicking a course item sets the shared
        // courseListState.selectedCourse rune, which CourseDescription.svelte
        // (mounted below) reads to render the description panel.
        const courseContainerEl = document.getElementById('course-container');
        if (courseContainerEl) {
            courseContainerEl.innerHTML = '';
            mount(CourseList, {
                target: courseContainerEl,
                props: {
                    filterService,
                    courseSelectionService,
                    profileStateManager: services.profileStateManager
                }
            });
        }

        // Mount the course-description panel (Svelte) into #course-description. It
        // reads courseListState.selectedCourse (a rune set by CourseList /
        // SelectedCoursesPanel item clicks) and renders the description, category
        // tooltip, and component tabs (lectures/discussions/labs/interest lists) —
        // replacing CourseController.showCourseDescription / displayCourseDescription.
        const courseDescriptionEl = document.getElementById('course-description');
        if (courseDescriptionEl) {
            courseDescriptionEl.innerHTML = '';
            mount(CourseDescription, {
                target: courseDescriptionEl,
                props: { courseDataService }
            });
        }

        // Mount the planner SELECTED-courses panel (Svelte) into
        // .selected-courses-section. It renders the whole section (header
        // expander + list), deriving its list from appState.selectedCourses (a
        // rune) so it reacts to selection changes on its own — replacing
        // CourseController.displaySelectedCourses / add/removeSelectedCourseToSidebar
        // and the initializeSelectedCoursesExpander wiring. Its remove button
        // calls stopPropagation so the still-global `.course-remove-btn` handler
        // (which serves the vanilla SCHEDULE sidebar) does not double-fire.
        // Clicking an item sets the shared courseListState.selectedCourse rune,
        // which CourseDescription.svelte reads to render the description panel.
        const selectedSectionEl = document.querySelector('.selected-courses-section');
        if (selectedSectionEl) {
            selectedSectionEl.innerHTML = '';
            mount(SelectedCoursesPanel, {
                target: selectedSectionEl,
                props: {
                    courseSelectionService
                }
            });
        }

        // Mount the planner/schedule page tabs (Svelte). It reads
        // uiState.currentPage (a rune) for its reactive `active` class —
        // replacing the tab `.active` toggle that used to live in
        // UIStateManager.applyPageEffects() and the imperative click wiring
        // below. Same ids/base classes/labels are preserved so the tutorial's
        // `#planner-tab`/`#schedule-tab` selectors keep working. onSwitch runs
        // switchToPageView, which performs the same side-effects the old
        // tab-click handlers did.
        const navTabsPillEl = document.querySelector('.nav-tabs-pill');
        if (navTabsPillEl) {
            navTabsPillEl.innerHTML = '';
            mount(PageTabs, {
                target: navTabsPillEl,
                props: {
                    uiStateManager: services.uiStateManager,
                    onSwitch: (page: PageId) => this.switchToPageView(page)
                }
            });
        }

        // Mount the theme dropdown (Svelte). It reads uiState.currentThemeId
        // (a rune bumped by ThemeManager.setTheme) for its reactive current-name
        // text + active-option highlight — so the settings-menu "Toggle Theme"
        // (which calls themeManager.setTheme directly) keeps it in sync without
        // any imperative wiring. The saved-theme application that the old
        // ThemeSelector.initializeTheme() performed now lives in init() below.
        const themeSelectorEl = document.querySelector('.theme-selector');
        if (themeSelectorEl) {
            themeSelectorEl.innerHTML = '';
            mount(ThemeSelector, {
                target: themeSelectorEl,
                props: { profileStateManager }
            });
        }

        // Mount the declarative Svelte modal layer (ModalLayer) into #modal-root,
        // once. It reads uiState.openModals (a rune) and renders a Svelte
        // component for each open id. Every modal is now declarative — there is
        // no vanilla ModalService/BaseModal layer left, so openModals is the
        // sole modal registry. Closing routes through uiStateManager.modalClosed
        // so the rune stays the single source of truth.
        // `tutorial` is passed as a THUNK, not a value: services.tutorial is
        // assigned in main.ts AFTER this constructor runs (setupTutorial needs
        // the constructed MainController), so a static prop would capture
        // undefined. The thunk is read lazily inside ModalLayer when the
        // tutorials modal opens (long after init), by which point it's set.
        const modalRootEl = document.getElementById('modal-root');
        if (modalRootEl) {
            mount(ModalLayer, {
                target: modalRootEl,
                props: {
                    uiStateManager: services.uiStateManager,
                    getTutorial: () => services.tutorial,
                    scheduleManagementService: services.scheduleManagementService,
                    filterService: services.filterService,
                    courseSelectionService: services.courseSelectionService,
                    autoScheduleOrchestrator: this.autoScheduleOrchestrator,
                    profileStateManager: services.profileStateManager,
                    getDepartments: () => this.allDepartments,
                }
            });
        }

        // Mount the auto-schedule footer controls (Svelte). It reads
        // appState.autoScheduleCount/Index (runes the orchestrator publishes) to
        // toggle between the Auto-Schedule button and the prev/restart/next nav +
        // progress bar — replacing ScheduleController.setupAutoScheduleButton()
        // and the imperative updateAutoScheduleButtonUI() DOM updates. The
        // `#auto-schedule-btn` id is preserved so the tutorial selector keeps
        // working. Navigation re-applies the schedule via batchSetSelectedComponents,
        // which updates appState.selectedCourses — the declarative grid reacts on
        // its own, so no after-navigate callback is needed.
        const autoScheduleFooterEl = document.querySelector('.schedule-sidebar-content-footer');
        if (autoScheduleFooterEl) {
            autoScheduleFooterEl.innerHTML = '';
            mount(AutoScheduleControls, {
                target: autoScheduleFooterEl,
                props: {
                    autoScheduleOrchestrator: this.autoScheduleOrchestrator,
                    onOpenAutoSchedule: () => this.scheduleController.openAutoSchedule(),
                }
            });
        }

        // Mount the schedule sidebar's selected-courses list (Svelte). It reads
        // appState.selectedCourses (a rune) and re-renders on add/remove/section
        // change — replacing ScheduleController.displayScheduleSelectedCourses()
        // and the global .course-remove-btn/.course-clear-sections-btn/
        // .schedule-course-header click delegation. It mounts into a
        // display:contents child wrapper so the vanilla ComponentSelectionWizard
        // panel (appendChild'd to #schedule-sidebar-content) survives as a sibling.
        const scheduleCoursesEl = document.getElementById('schedule-sidebar-courses');
        if (scheduleCoursesEl) {
            mount(ScheduleSidebar, {
                target: scheduleCoursesEl,
                props: {
                    courseSelectionService: services.courseSelectionService,
                    getIncompleteInfo: (sc: SelectedCourse) => this.scheduleController.getIncompleteSelectionInfo(sc),
                    onOpenWizard: (course: Course, existing: SelectedCourse | undefined) => this.scheduleController.openComponentWizard(course, existing),
                }
            });
        }

        // Mount the component-selection wizard host as a sibling of the courses
        // wrapper inside #schedule-sidebar-content. It's driven by the wizardState
        // store (ScheduleController.openComponentWizard) and renders the wizard panel
        // as an absolute overlay over the sidebar content — replacing the old vanilla
        // ComponentSelectionWizard + SidebarManager.openPanel plumbing.
        const scheduleSidebarContentEl = document.getElementById('schedule-sidebar-content');
        if (scheduleSidebarContentEl) {
            mount(WizardHost, { target: scheduleSidebarContentEl });
        }

        // Mount the always-present Calendar Events button into the sidebar header
        // slot — replaces ScheduleController.renderCalendarEventsHeader().
        const calendarSlotEl = document.getElementById('calendar-events-header-slot');
        if (calendarSlotEl) {
            mount(CalendarEventsButton, {
                target: calendarSlotEl,
                props: {
                    onClick: () => localEventService.openAddModal(),
                }
            });
        }

        // Mount the declarative schedule grids (Svelte). They render the
        // .terms-grid + 4 term grids and are reactive on appState.selectedCourses,
        // the wizard preview rune, and activeSchedule.localEvents — replacing
        // ScheduleController.renderScheduleGrids() and all its imperative
        // call sites. Section click → section-info modal; event click → delete
        // confirm; recolor + auto-schedule generate/navigate flow through runes.
        const gridsRootEl = document.getElementById('schedule-grids-root');
        if (gridsRootEl) {
            mount(ScheduleGrids, {
                target: gridsRootEl,
                props: {
                    colorService: this.colorService,
                    conflictEngine: conflictDetector,
                    onOpenSectionInfo: (courseId: string, sectionNumber: string) =>
                        this.scheduleController.showSectionInfoModal(courseId, sectionNumber),
                    onOpenDeleteEvent: (eventId: string) =>
                        localEventService.openDeleteModal(eventId),
                }
            });
        }

        // Set up course data event subscriptions via AppBootstrap
        AppBootstrap.setupCourseDataSubscriptions(services, {
            setAllDepartments: (departments) => {
                this.allDepartments = departments;
            },
            onDataLoaded: () => {
                // FilterModal reads departments via its getDepartments thunk at
                // open time (this.allDepartments, just updated above).
            },
            onDataRefreshed: () => {
                this.refreshCurrentView();
            },
        });

        // Initialize tracking for course changes
        const initialSelectedCourses = courseSelectionService.getSelectedCourses();
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

        // The course list (CourseList Svelte component) reacts to the filter
        // store on its own, so the watch only needs to drive the schedule-side
        // refresh now.
        watch(
            () => filterService.getActiveFilters(),
            () => {
                this.scheduleController.applyFiltersAndRefresh();
            },
        );

        // Initialize the schedule-filter button state. The planner filter trio
        // (filter / bookmark / clear) is now the FilterButtons Svelte component,
        // which primes itself from the reactive filter state.
        setTimeout(() => {
            this.updateScheduleFilterButtonState();
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
            // Apply the saved theme now that storage has loaded — this replicates
            // the old ThemeSelector.initializeTheme()/loadSavedTheme() behavior.
            // setTheme also bumps uiState.currentThemeId, so the mounted Svelte
            // ThemeSelector reflects the saved theme as its active/current option.
            const savedTheme = this.services.profileStateManager.getPreferences()?.theme ?? 'wpi-dark';
            this.services.themeManager.setTheme(savedTheme);

            // Set "All Departments" as the default selection on startup
            this.initializeDefaultDepartmentView();

            this.setupEventListeners();
            this.setupCourseSelectionListener();
            this.setupPageNavigationListener();
            this.setupScheduleChangeListener();
            this.initializeSwipeNavigation();
            AppBootstrap.setupWindowUnloadHandler();

            // Wire up calendar event provider for auto-scheduler
            this.autoScheduleOrchestrator.setCalendarEventProvider(calendarEventProvider);

            // Mount the declarative clear-all-sections button into its sidebar
            // slot — replaces ScheduleController.setupClearAllSectionsButton().
            const clearAllSlotEl = document.getElementById('clear-all-sections-slot');
            if (clearAllSlotEl) {
                mount(ClearAllSectionsButton, {
                    target: clearAllSlotEl,
                    props: {
                        courseSelectionService: this.services.courseSelectionService,
                    }
                });
            }

            this.autoScheduleOrchestrator.setupCourseSelectionChangeListener();

            // The SELECTED-courses panel is the SelectedCoursesPanel Svelte
            // component now (reactive on appState.selectedCourses), so no initial
            // imperative render here.

            // The course list's select buttons are reactive (CourseList reads
            // appState.selectedById), so no initial imperative selection sync.

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
            this.services.uiStateManager.setPage('schedule');
        }
    }

    private handleSwipeRight(): void {
        if (this.services.uiStateManager.getCurrentPage() === 'schedule') {
            this.scheduleController.closeComponentWizard();
            this.services.uiStateManager.setPage('planner');
        }
    }

    // Performs the page switch + side-effects the old #planner-tab/#schedule-tab
    // click handlers ran. Invoked by the PageTabs Svelte component's onSwitch.
    private switchToPageView(page: PageId): void {
        if (page === 'planner') {
            // Close wizard when switching to planner/classes page
            this.scheduleController.closeComponentWizard();
            this.services.uiStateManager.setPage('planner');
        } else {
            this.services.uiStateManager.setPage('schedule');
        }
    }


    private setupEventListeners(): void {
        // The course LIST, the planner SELECTED-courses panel, and the SCHEDULE
        // sidebar (ScheduleSidebar/SelectedCourseItem) are all Svelte components
        // that own their own click handling now — remove/clear-sections and
        // open-wizard for the schedule sidebar route through component props, so
        // the old global `.course-remove-btn`/`.course-clear-sections-btn`/
        // `.schedule-course-header` click delegation is gone.

        // The course search bar (input + professor-mode toggle + clear button +
        // professor autocomplete dropdown) is now the SearchBar Svelte component,
        // mounted into .search-input-wrapper. It owns its own input/blur/click
        // wiring, the debounced filter write, and the professor autocomplete; an
        // internal $effect adopts external `searchText` filter changes back into
        // the input (replacing syncSearchInputFromFilters).

        // Schedule picker button
        const schedulePickerBtn = document.getElementById('schedule-picker-btn');
        if (schedulePickerBtn) {
            schedulePickerBtn.addEventListener('click', () => {
                this.openSchedulePicker();
            });
        }

        // Tab navigation is rendered by the PageTabs Svelte component (mounted
        // into .nav-tabs-pill); it calls switchToPageView, which runs the same
        // side-effects (close wizard / switch page / render schedule grids).

        // View toggle buttons are rendered by the ViewToggle Svelte component
        // (mounted into #view-toggle); it calls setView + refreshCurrentView.

        // The planner filter trio (filter / bookmark / clear) is rendered by the
        // FilterButtons Svelte component (mounted into #filter-buttons-host). Icon
        // injection, click handlers, and reactive state all live there.

        // Schedule filter button
        const scheduleFilterButton = document.getElementById('schedule-filter-btn');
        if (scheduleFilterButton) {
            scheduleFilterButton.insertAdjacentHTML('afterbegin', getInlineSVG('FILTER_FILLED', 'filter-icon'));
            scheduleFilterButton.addEventListener('click', () => {
                this.openFilterModal();
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

    // The course list (term-badge expansion, select/bookmark, load-more, opening
    // a course's description) is now the CourseList Svelte component. Its term
    // expansion uses a `slide` transition; the old imperative FLIP height
    // animation (animateTermExpansion / getHeightAnimDuration /
    // restoreTermExpansionState / processPendingExpansions) and the
    // displayCoursesWithCancellation/handleLoadMoreClick rendering path are gone.

    // refreshCurrentView no longer renders the list (CourseList derives the
    // displayed courses from the reactive filter store on its own). It is still
    // called from undo/redo (refreshUI) and the data-refresh subscription; it
    // keeps the schedule-side refresh those paths relied on.
    private refreshCurrentView(): void {
        this.scheduleController.applyFiltersAndRefresh();
    }

    // updateFilterButtonState / updateClearFiltersButtonState /
    // updateBookmarkFilterButtonState were deleted: the planner filter trio is
    // now the FilterButtons Svelte component, which derives its state from the
    // reactive filter store. updateScheduleFilterButtonState stays — the
    // schedule-filter button is co-owned with ScheduleController.

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
        // The schedule picker is now the SchedulePicker Svelte component in the
        // declarative ModalLayer; opening it = pushing its id onto the rune.
        this.services.uiStateManager.modalOpened('schedule-picker');
    }

    navigateSchedulePickerToTab(tab: 'schedules' | 'settings'): void {
        // Tutorial tab-navigation channel — SchedulePicker reads this and applies
        // it to its local active tab, then clears it.
        modalState.schedulePickerTab = tab;
    }

    openFilterModal(): void {
        // Planner + schedule filter both open the declarative FilterModal in
        // 'filter' mode (id 'filter-modal'); ModalLayer renders it.
        modalState.filter = { mode: 'filter' };
        this.services.uiStateManager.modalOpened('filter-modal');
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
        // Re-sync the open FilterModal's checkboxes from filterService (tutorial
        // back-navigation). The component responds to this tick.
        modalState.filterRefreshTick++;
    }

    syncCourseSelectionUI(): void {
        // No-op: both the course LIST (CourseList) and the SELECTED-courses panel
        // (SelectedCoursesPanel) are reactive Svelte components reading
        // appState, so there is nothing to imperatively refresh. Kept as a
        // stable entry point because setupTutorial.ts still calls it.
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


    private previousSelectedCoursesMap = new Map<string, SelectionSnapshot>();

    private setupScheduleChangeListener(): void {
        // React to active-schedule (re)activation via runes.
        watch(() => appState.activation, () => {
            this.updateSchedulePickerButton();

            // Skip reloading events if this was just an exclusion change
            // (the UI already updated optimistically, no need to refetch)
            if (appState.activation.source === 'calendar-event-exclusion') {
                return;
            }

            const activeSchedule = this.services.scheduleManagementService.getActiveSchedule();
            if (activeSchedule) {
                // Sync year filter to match the newly activated schedule
                if (activeSchedule.year !== undefined) {
                    this.services.filterService.addFilter('academicYear', { year: activeSchedule.year });
                } else {
                    const defaultYear = this.services.profileStateManager.getDefaultAcademicYear();
                    if (defaultYear !== undefined) {
                        this.services.filterService.addFilter('academicYear', { year: defaultYear });
                    }
                }
                // The planner filter buttons (FilterButtons Svelte component)
                // react to the academicYear filter change above on their own.
            }
        });
        this.updateSchedulePickerButton();
    }

    private setupPageNavigationListener(): void {
        let prevPage = uiState.currentPage;
        watch(() => uiState.currentPage, () => {
            const page = uiState.currentPage;
            // The course list's select buttons reflect appState.selectedById
            // reactively (CourseList Svelte component), so returning to the
            // planner no longer needs an imperative syncCourseSelectionState().
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

        // The course LIST's select buttons (CourseList), the planner
        // SELECTED-courses panel (SelectedCoursesPanel), the SCHEDULE sidebar
        // (ScheduleSidebar), and the schedule GRID (ScheduleGrids) are reactive
        // Svelte components reading appState, so added/removed courses and section
        // changes need no imperative refresh here.
        this.updateSelectedCoursesState(selectedCourses);
    }

    private updateSelectedCoursesState(selectedCourses: SelectedCourse[]): void {
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
        // The planner SELECTED-courses panel, the SCHEDULE sidebar, and the
        // schedule GRID are all reactive Svelte components reading appState, so
        // nothing on the schedule page needs an imperative refresh here.
        if (this.services.uiStateManager.currentPage !== 'schedule') {
            this.refreshCurrentView();
        }
    }

    // syncInitialCourseSelectionUI was removed: the course list's select buttons
    // are reactive now (CourseList reads appState.selectedById), so the initial
    // selection state needs no imperative priming.

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

    private syncModalSearchInput(_query: string): void {
        // No-op: the filter modal has no search-text input (the planner search bar
        // is the SearchBar Svelte component). Kept as a stable SearchBar callback.
    }

    private resetSearchAndDepartmentFilters(): void {
        // Removing the searchText filter clears the SearchBar input reactively
        // (its internal $effect adopts the now-empty filter query and resets
        // professor mode); removing the department filter resets the sidebar to
        // "All Departments". Both are Svelte components that react on their own.
        this.services.filterService.removeFilter('searchText');
        this.services.filterService.removeFilter('department');
    }

    private initializeDefaultDepartmentView(): void {
        // No department filter on startup → the sidebar shows "All Departments"
        // as active; trigger a refresh to show all courses.
        this.refreshCurrentView();
    }

}