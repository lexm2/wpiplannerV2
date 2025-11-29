import type { Department, ScheduleDB } from '../types/types';
import type { CourseDataService } from './courseDataService';
import type { TimestampManager } from '../ui/controllers/TimestampManager';
import type { CourseSelectionService } from './CourseSelectionService';
import type { ScheduleManagementService } from './ScheduleManagementService';

/**
 * Result object returned from loadAndDistribute()
 */
export interface LoadResult {
    success: boolean;
    scheduleDB?: ScheduleDB;
    departments?: Department[];
    serverTimestamp?: string;
    error?: string;
}

/**
 * Consumer callback type for department data
 */
type DepartmentConsumer = (departments: Department[]) => void;

/**
 * Consumer callback type for catalog data (same as department, but semantically different usage)
 */
type CatalogConsumer = (departments: Department[]) => void;

/**
 * CourseDataCoordinator
 *
 * Manages the distribution of loaded course data to all dependent services and controllers.
 * Abstracts the complex initialization logic from MainController, ensuring consistent data flow
 * and reducing coupling.
 *
 * Key Responsibilities:
 * - Load course data via CourseDataService
 * - Distribute data to registered consumers in correct order
 * - Coordinate post-load operations (section reconstruction, default schedule init)
 * - Manage timestamp tracking
 *
 * Usage Pattern:
 * ```typescript
 * // 1. Create coordinator
 * const coordinator = new CourseDataCoordinator(
 *   courseDataService,
 *   timestampManager,
 *   courseSelectionService,
 *   scheduleManagementService
 * );
 *
 * // 2. Register consumers
 * coordinator.registerDepartmentConsumer((depts) => controller.setAllDepartments(depts));
 * coordinator.registerCatalogConsumer((depts) => stateManager.setCourseData(depts));
 *
 * // 3. Load and distribute
 * const result = await coordinator.loadAndDistribute();
 * ```
 */
export class CourseDataCoordinator {
    private courseDataService: CourseDataService;
    private timestampManager: TimestampManager;
    private courseSelectionService: CourseSelectionService;
    private scheduleManagementService: ScheduleManagementService;

    private departmentConsumers: DepartmentConsumer[] = [];
    private catalogConsumers: CatalogConsumer[] = [];

    private scheduleDB: ScheduleDB | null = null;
    private allDepartments: Department[] = [];
    private loaded: boolean = false;

    constructor(
        courseDataService: CourseDataService,
        timestampManager: TimestampManager,
        courseSelectionService: CourseSelectionService,
        scheduleManagementService: ScheduleManagementService
    ) {
        this.courseDataService = courseDataService;
        this.timestampManager = timestampManager;
        this.courseSelectionService = courseSelectionService;
        this.scheduleManagementService = scheduleManagementService;
    }

    /**
     * Register a consumer that receives the full department array
     * (e.g., DepartmentController, CourseController, CourseSelectionService)
     */
    registerDepartmentConsumer(consumer: DepartmentConsumer): void {
        this.departmentConsumers.push(consumer);
    }

    /**
     * Register a consumer that receives the catalog for indexing/search
     * (e.g., ProfileStateManager, SearchService, FilterModalController)
     */
    registerCatalogConsumer(consumer: CatalogConsumer): void {
        this.catalogConsumers.push(consumer);
    }

    /**
     * Load course data and distribute to all registered consumers
     *
     * Execution Flow:
     * 1. Load data from CourseDataService
     * 2. Distribute to department consumers
     * 3. Distribute to catalog consumers
     * 4. Reconstruct section objects (requires catalog to be set)
     * 5. Initialize default schedule if needed
     * 6. Update client timestamp
     * 7. Load server timestamp
     * 8. Return result with all data and metadata
     *
     * @returns LoadResult with success status, data, and timestamps
     */
    async loadAndDistribute(): Promise<LoadResult> {
        try {
            // Step 1: Load course data
            console.log('[CourseDataCoordinator] Loading course data...');
            this.scheduleDB = await this.courseDataService.loadCourseData();
            this.allDepartments = this.scheduleDB.departments;

            // Step 2: Distribute to department consumers
            console.log(`[CourseDataCoordinator] Distributing to ${this.departmentConsumers.length} department consumers...`);
            for (const consumer of this.departmentConsumers) {
                consumer(this.allDepartments);
            }

            // Step 3: Distribute to catalog consumers
            console.log(`[CourseDataCoordinator] Distributing to ${this.catalogConsumers.length} catalog consumers...`);
            for (const consumer of this.catalogConsumers) {
                consumer(this.allDepartments);
            }

            // Step 4: Post-distribution operations (MUST happen after catalog is set)
            console.log('[CourseDataCoordinator] Running post-distribution operations...');

            // Reconstruct section objects (requires ProfileStateManager to have course catalog)
            this.courseSelectionService.reconstructSectionObjects();

            // Initialize default schedule if needed
            await this.scheduleManagementService.initializeDefaultScheduleIfNeeded();

            // Update client timestamp
            this.timestampManager.updateClientTimestamp();

            // Step 5: Load server timestamp
            const serverTimestamp = await this.timestampManager.loadServerTimestamp();

            // Mark as loaded
            this.loaded = true;

            console.log('[CourseDataCoordinator] Load and distribution complete');
            console.log(`  - Departments: ${this.allDepartments.length}`);
            console.log(`  - Server timestamp: ${serverTimestamp || 'N/A'}`);

            return {
                success: true,
                scheduleDB: this.scheduleDB,
                departments: this.allDepartments,
                serverTimestamp: serverTimestamp || undefined
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[CourseDataCoordinator] Failed to load and distribute:', error);

            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Get the loaded departments
     */
    getDepartments(): Department[] {
        return this.allDepartments;
    }

    /**
     * Get the loaded schedule database
     */
    getScheduleDB(): ScheduleDB | null {
        return this.scheduleDB;
    }

    /**
     * Check if data has been loaded
     */
    isLoaded(): boolean {
        return this.loaded;
    }

    /**
     * Get the current server timestamp
     */
    async getServerTimestamp(): Promise<string | null> {
        return await this.timestampManager.loadServerTimestamp();
    }

    /**
     * Get the client timestamp
     */
    getClientTimestamp(): string {
        return new Date().toISOString();
    }
}
