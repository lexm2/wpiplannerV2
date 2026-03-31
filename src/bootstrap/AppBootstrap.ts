import { CourseDataService } from '../services/data/courseDataService'
import { CourseSelectionService } from '../services/selection/CourseSelectionService'
import { BitMaskEngine } from '../core/scheduling/BitMaskEngine'
import { ModalService } from '../services/ui/ModalService'
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

export class AppBootstrap {
    static createServices(): ServiceContainer {
        const profileStateManager = ProfileStateManager.getInstance();
        const storageService = StorageService.getInstance(profileStateManager);

        const themeManager = ThemeManager.getInstance();
        themeManager.setStorage(storageService);

        const courseDataService = new CourseDataService();
        const courseSelectionService = new CourseSelectionService(profileStateManager);
        const conflictDetector = new BitMaskEngine();
        const modalService = new ModalService();
        profileStateManager.setModalService(modalService);

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
            modalService,
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
            onDataRefreshed: (departments: Department[]) => void;
        }
    ): void {
        const {
            courseDataService, profileStateManager, filterService,
            courseSelectionService, scheduleManagementService, timestampManager
        } = services;

        courseDataService.on('data-loaded', (event) => {
            profileStateManager.setCourseData(event.departments);

            const allCourses = event.departments.flatMap(d => d.courses);

            courseSelectionService.setAllDepartments(event.departments);
            courseSelectionService.reconstructSectionObjects();
            timestampManager.updateClientTimestamp();

            // Backfill year for existing schedules that lack one
            const newestYear = profileStateManager.getNewestAcademicYear();
            for (const schedule of profileStateManager.getAllSchedules()) {
                if (schedule.year === undefined && newestYear !== undefined) {
                    profileStateManager.updateSchedule(schedule.id, { year: newestYear }, 'system');
                }
            }

            // Apply academic year filter based on active schedule's year
            if (!filterService.hasFilter('academicYear')) {
                const activeSchedule = profileStateManager.getActiveSchedule();
                const yearToFilter = activeSchedule?.year ?? newestYear;
                if (yearToFilter !== undefined) {
                    filterService.addFilter('academicYear', { year: yearToFilter });
                }
            }

            callbacks.setAllDepartments(event.departments);
            callbacks.onDataLoaded(event.departments);
        });

        courseDataService.on('data-refreshed', (event) => {
            profileStateManager.setCourseData(event.departments);

            courseSelectionService.setAllDepartments(event.departments);
            callbacks.setAllDepartments(event.departments);

            callbacks.onDataRefreshed(event.departments);
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
                e.preventDefault();
                e.returnValue = '';
                return '';
            }

            StorageWorkerManager.getInstance().terminate();
        });
    }
}
