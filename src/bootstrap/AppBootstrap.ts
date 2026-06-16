import { CourseDataService } from '../services/data/courseDataService'
import { CourseSelectionService } from '../services/selection/CourseSelectionService'
import { BitMaskEngine } from '../core/scheduling/BitMaskEngine'
import { FilterService } from '../services/filtering/FilterService'
import { ScheduleManagementService } from '../services/selection/ScheduleManagementService'
import { ProfileStateManager } from '../core/state/ProfileStateManager'
import { StorageService } from '../services/selection/StorageService'
import { ThemeManager } from '../themes/ThemeManager'
import { OperationManager } from '../utils/RequestCancellation'
import { UIStateManager } from '../services/ui/UIStateManager'
import { TimestampManager } from '../ui/controllers/TimestampManager'
import { rateMyProfessorService } from '../services/external/RateMyProfessorService'
import { StorageWorkerManager } from '../workers/StorageWorkerManager'
import { TermBoundsService } from '../utils/termBounds'
import { createDefaultFilters, SearchTextFilter } from '../core/filtering/filters'
import { CourseColorService } from '../services/scheduling/CourseColorService'
import { AutoScheduleOrchestrator } from '../services/scheduling/AutoScheduleOrchestrator'
import { calendarEventProvider } from '../services/scheduling/calendarEventProvider'
import { componentWizardService } from '../services/scheduling/componentWizardService'
import { localEventService } from '../services/scheduling/localEventService'
import { sectionInfoService } from '../services/scheduling/sectionInfoService'
import { autoScheduleService } from '../services/scheduling/autoScheduleService'
import type { ServiceContainer } from './ServiceContainer'
import { appState } from '../core/state/appState.svelte'
import { watch } from '../svelte/reactivity.svelte'

export class AppBootstrap {
    static createServices(): ServiceContainer {
        const profileStateManager = ProfileStateManager.getInstance();
        const storageService = StorageService.getInstance(profileStateManager);

        const themeManager = ThemeManager.getInstance();
        themeManager.setStorage(storageService);

        const courseDataService = new CourseDataService();
        const courseSelectionService = new CourseSelectionService(profileStateManager);
        const conflictDetector = new BitMaskEngine();

        const filterService = new FilterService({
            getBookmarkedCourseIds: () => profileStateManager.getBookmarkedCourseIds()
        });

        const scheduleManagementService = new ScheduleManagementService(profileStateManager, courseSelectionService);

        const uiStateManager = new UIStateManager();
        const timestampManager = new TimestampManager();
        const operationManager = new OperationManager();

        // Derived UI services (previously constructed in the MainController ctor).
        // They depend only on courseSelectionService/filterService, so they belong
        // in the container alongside everything else — App.svelte (Phase 13C) reads
        // them for the grid/footer/modal-layer props.
        const colorService = new CourseColorService(courseSelectionService);
        const autoScheduleOrchestrator = new AutoScheduleOrchestrator(courseSelectionService, filterService);

        return {
            profileStateManager,
            storageService,
            courseDataService,
            courseSelectionService,
            conflictDetector,
            filterService,
            scheduleManagementService,
            themeManager,
            operationManager,
            uiStateManager,
            timestampManager,
            colorService,
            autoScheduleOrchestrator,
        };
    }

    // Inject the non-singleton services into the standalone scheduling-service
    // singletons (componentWizard / localEvent / sectionInfo / autoSchedule).
    // Previously done in the MainController constructor; now part of bootstrap so
    // it runs before the tutorial and the component mounts.
    static initStandaloneServices(services: ServiceContainer): void {
        const {
            courseSelectionService, courseDataService, filterService,
            profileStateManager, uiStateManager, colorService, autoScheduleOrchestrator,
        } = services;

        componentWizardService.init(courseSelectionService, courseDataService, filterService, uiStateManager);
        localEventService.init(profileStateManager, uiStateManager);
        sectionInfoService.init(courseSelectionService, colorService, uiStateManager);
        autoScheduleService.init(courseSelectionService, filterService, colorService, autoScheduleOrchestrator, uiStateManager);
    }

    static setupCourseDataSubscriptions(services: ServiceContainer): void {
        const {
            profileStateManager, filterService,
            courseSelectionService, timestampManager
        } = services;

        // CourseDataService reassigns appState.loadedDepartments (a $state.raw,
        // always a freshly-built array) on both the initial fetch and every
        // post-sync refresh, so one watcher keyed on that data covers both —
        // replacing the old dataLoad/dataRefresh generation counters. `watch`
        // skips its initial run and subscriptions are wired before loadCourseData,
        // so the first fire is the initial load; a local flag then routes the
        // one-time setup vs. the lighter refresh path.
        // The FilterModal reads departments straight off appState.loadedDepartments
        // (the same array this watcher syncs), so no separate "allDepartments"
        // cache/callback is needed — both the one-time setup and the refresh path
        // only sync the non-reactive services here; every Svelte view re-derives
        // from appState.loadedDepartments on its own.
        let initialLoadDone = false;
        watch(() => appState.loadedDepartments, () => {
            const departments = appState.loadedDepartments;
            profileStateManager.setCourseData(departments);
            courseSelectionService.setAllDepartments(departments);

            if (!initialLoadDone) {
                initialLoadDone = true;
                courseSelectionService.reconstructSectionObjects();
                timestampManager.updateClientTimestamp();

                // Backfill year for existing schedules that lack one
                const defaultYear = profileStateManager.getDefaultAcademicYear();
                for (const schedule of profileStateManager.getAllSchedules()) {
                    if (schedule.year === undefined && defaultYear !== undefined) {
                        profileStateManager.updateSchedule(schedule.id, { year: defaultYear }, 'system');
                    }
                }

                // Apply academic year filter based on active schedule's year
                if (!filterService.hasFilter('academicYear')) {
                    const activeSchedule = profileStateManager.getActiveSchedule();
                    const yearToFilter = activeSchedule?.year ?? defaultYear;
                    if (yearToFilter !== undefined) {
                        filterService.addFilter('academicYear', { year: yearToFilter });
                    }
                }
            }
        });
    }

    static initializeFilters(services: ServiceContainer): void {
        const { filterService } = services;

        const filters = createDefaultFilters(rateMyProfessorService);
        filters.forEach(filter => {
            filterService.registerFilter(filter);
        });

        const searchTextFilter = new SearchTextFilter();
        filterService.registerFilter(searchTextFilter);
        filterService.setConflictDetector();
    }

    static async initializeAsyncServices(services: ServiceContainer): Promise<void> {
        const { storageService, courseSelectionService, scheduleManagementService, courseDataService, timestampManager } = services;

        const storageWorker = StorageWorkerManager.getInstance();
        await storageWorker.initialize();

        await storageService.initialize();
        await rateMyProfessorService.loadData();
        await courseSelectionService.initialize();
        await scheduleManagementService.initialize();

        await TermBoundsService.getInstance().loadTermBounds();

        await courseDataService.loadCourseData();
        await timestampManager.loadServerTimestamp();
    }

    static setupWindowUnloadHandler(): void {
        window.addEventListener('beforeunload', async (e) => {
            const profileStateManager = ProfileStateManager.getInstance();

            if (profileStateManager.hasPendingSaves()) {
                // preventDefault() triggers the browser's unload confirmation; the
                // legacy returnValue mechanism is deprecated and no longer required.
                e.preventDefault();
                return;
            }

            StorageWorkerManager.getInstance().terminate();
        });
    }

    // Async app startup, run after the component shell is mounted (the previous
    // MainController.init()). Loads data + storage, applies the saved theme, wires
    // the auto-scheduler's calendar provider + selection-invalidation listener,
    // registers the unload handler, and auto-starts the welcome tutorial on first
    // visit. The mounted Svelte views show their own loading states until
    // appState.loadedDepartments populates (via setupCourseDataSubscriptions).
    static async startApp(services: ServiceContainer): Promise<void> {
        try {
            await AppBootstrap.initializeAsyncServices(services);

            // Apply the saved theme now that storage has loaded — setTheme bumps
            // uiState.currentThemeId so the mounted ThemeSelector reflects it.
            const savedTheme = services.profileStateManager.getPreferences()?.theme ?? 'wpi-dark';
            services.themeManager.setTheme(savedTheme);

            services.autoScheduleOrchestrator.setCalendarEventProvider(calendarEventProvider);
            services.autoScheduleOrchestrator.setupCourseSelectionChangeListener();
            AppBootstrap.setupWindowUnloadHandler();

            if (!localStorage.getItem('wpi_visited')) {
                await services.tutorial?.start('welcome');
            }
        } catch (error) {
            console.error('Failed to initialize application:', error);
            services.uiStateManager.showErrorMessage(
                'Failed to initialize application. Some features may not work properly.',
                () => services.scheduleManagementService.clearAllSchedules()
            );
        }
    }
}
