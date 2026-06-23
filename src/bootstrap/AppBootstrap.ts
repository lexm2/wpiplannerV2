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
import { DegreeImportService } from '../services/degree/degreeImportService'
import { TransactionalStorageManager } from '../core/storage/TransactionalStorageManager'
import { calendarEventProvider } from '../services/scheduling/calendarEventProvider'
import { componentWizardService } from '../services/scheduling/componentWizardService'
import { localEventService } from '../services/scheduling/localEventService'
import { sectionInfoService } from '../services/scheduling/sectionInfoService'
import { autoScheduleService } from '../services/scheduling/autoScheduleService'
import type { ServiceContainer } from './ServiceContainer'

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

        // Derived UI services: depend only on courseSelectionService/filterService.
        const colorService = new CourseColorService(courseSelectionService);
        const autoScheduleOrchestrator = new AutoScheduleOrchestrator(courseSelectionService, filterService);

        // Degree page: imports/persists the Workday Academic Progress export.
        // Uses its own storage-manager handle (degree data lives in localStorage,
        // independent of the schedule/IndexedDB collection).
        const degreeImportService = new DegreeImportService(new TransactionalStorageManager());

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
            degreeImportService,
        };
    }

    // Inject the non-singleton services into the standalone scheduling-service
    // singletons. Runs before the tutorial and component mount.
    static initStandaloneServices(services: ServiceContainer): void {
        const {
            courseSelectionService, courseDataService, filterService,
            profileStateManager, uiStateManager, colorService, autoScheduleOrchestrator,
        } = services;

        componentWizardService.init(courseSelectionService, courseDataService, filterService);
        localEventService.init(profileStateManager, uiStateManager);
        sectionInfoService.init(courseSelectionService, colorService, uiStateManager);
        autoScheduleService.init(courseSelectionService, filterService, colorService, autoScheduleOrchestrator, uiStateManager);
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

        // Rehydrate a previously-imported degree record (no-op if none/invalid).
        await services.degreeImportService.load();
    }

    static setupWindowUnloadHandler(): void {
        window.addEventListener('beforeunload', async (e) => {
            const profileStateManager = ProfileStateManager.getInstance();

            if (profileStateManager.hasPendingSaves()) {
                // preventDefault() triggers the browser's unload confirmation;
                // the legacy returnValue mechanism is no longer required.
                e.preventDefault();
                return;
            }

            StorageWorkerManager.getInstance().terminate();
        });
    }

    // Async app startup, run after the component shell is mounted. Loads data +
    // storage, applies the saved theme, wires the auto-scheduler's calendar
    // provider, registers the unload handler, and auto-starts the welcome
    // tutorial on first visit. Views show loading states until
    // appState.loadedDepartments populates (App.svelte's $effect drives the sync).
    static async startApp(services: ServiceContainer): Promise<void> {
        try {
            await AppBootstrap.initializeAsyncServices(services);

            // Apply the saved theme now that storage has loaded.
            const savedTheme = services.profileStateManager.getPreferences()?.theme ?? 'wpi-dark';
            services.themeManager.setTheme(savedTheme);

            services.autoScheduleOrchestrator.setCalendarEventProvider(calendarEventProvider);
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
