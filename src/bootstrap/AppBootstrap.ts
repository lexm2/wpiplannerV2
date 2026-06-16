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
import type { ServiceContainer } from './ServiceContainer'
import type { Department } from '../types/types'
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
        };
    }

    static setupCourseDataSubscriptions(
        services: ServiceContainer,
        callbacks: {
            setAllDepartments: (departments: Department[]) => void;
            onDataLoaded: (departments: Department[]) => void;
        }
    ): void {
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

                callbacks.setAllDepartments(departments);
                callbacks.onDataLoaded(departments);
            } else {
                // Post-sync refresh: CourseDataService has reassigned
                // appState.loadedDepartments (a fresh array), so every reactive
                // view re-derives on its own — only the cached department list
                // needs updating here.
                callbacks.setAllDepartments(departments);
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
}
