import { Schedule, SelectedCourse } from '../../types/schedule'
import { ProfileStateManager, StateChangeEvent, StateChangeListener } from '../../core/state/ProfileStateManager'
import { DataValidator } from '../../core/validation/DataValidator'
import { CourseSelectionService } from './CourseSelectionService'
import { ICSGenerator, ICSExportOptions, ICSExportResult } from '../../utils/icsGenerator'

export interface ScheduleOperationResult {
    success: boolean;
    schedule?: Schedule;
    error?: string;
    warnings?: string[];
    message?: string;
}

export interface ScheduleChangeEvent {
    type: 'schedule_created' | 'schedule_deleted' | 'schedule_updated' | 'schedule_activated' | 'schedules_loaded';
    schedule?: Schedule;
    schedules?: Schedule[];
    timestamp: number;
    /** Source of the event, used to identify what triggered the change */
    source?: string;
}

export type ScheduleChangeListener = (event: ScheduleChangeEvent) => void;

export interface ScheduleCreationOptions {
    includeCurrentCourses?: boolean;
    copyFromSchedule?: string;
    autoActivate?: boolean;
    autoSave?: boolean;
}

export interface ScheduleUpdateOptions {
    updateName?: string;
    updateCourses?: boolean;
    autoSave?: boolean;
}

/**
 * Manages multi-schedule lifecycle with CRUD operations, validation, and event-driven UI synchronization
 */
export class ScheduleManagementService {
    private profileStateManager: ProfileStateManager;
    private courseSelectionService: CourseSelectionService;
    private dataValidator: DataValidator;
    private scheduleListeners = new Set<ScheduleChangeListener>();
    private isInitialized = false;
    private initializationPromise: Promise<boolean> | null = null;

    constructor(
        profileStateManager?: ProfileStateManager,
        courseSelectionService?: CourseSelectionService,
        dataValidator?: DataValidator
    ) {
        this.profileStateManager = profileStateManager || ProfileStateManager.getInstance();
        this.courseSelectionService = courseSelectionService || new CourseSelectionService(this.profileStateManager);
        this.dataValidator = dataValidator || new DataValidator();

        this.setupStateManagerListeners();
    }

    // Initialization
    async initialize(): Promise<boolean> {
        if (this.isInitialized) return true;
        if (this.initializationPromise) return this.initializationPromise;

        this.initializationPromise = this.performInitialization();
        return await this.initializationPromise;
    }

    private async performInitialization(): Promise<boolean> {
        try {
            // Initialize dependencies first
            await this.courseSelectionService.initialize();

            // Ensure profile state is loaded
            await this.profileStateManager.loadFromStorage();

            // Initialize default schedule if needed
            await this.initializeDefaultScheduleIfNeeded();

            this.isInitialized = true;
            return true;

        } catch (error) {
            console.error('ScheduleManagementService initialization failed:', error);
            this.isInitialized = false;
            return false;
        } finally {
            this.initializationPromise = null;
        }
    }

    // Schedule creation
    async createNewSchedule(name: string, options: ScheduleCreationOptions = {}): Promise<ScheduleOperationResult> {
        await this.ensureInitialized();

        const {
            includeCurrentCourses = false,
            copyFromSchedule,
            autoActivate = false,
            autoSave = true
        } = options;

        try {
            // Validate schedule name
            if (!name || name.trim().length === 0) {
                return {
                    success: false,
                    error: 'Schedule name cannot be empty'
                };
            }

            // Auto-generate unique name instead of rejecting duplicates
            const existingSchedules = this.profileStateManager.getAllSchedules();
            const uniqueName = this.generateUniqueScheduleName(name);
            
            // Use the unique name for creation
            name = uniqueName;

            let selectedCourses: SelectedCourse[] = [];

            if (copyFromSchedule) {
                // Copy from existing schedule
                const sourceSchedule = existingSchedules.find(s => s.id === copyFromSchedule);
                if (!sourceSchedule) {
                    return {
                        success: false,
                        error: `Source schedule with ID "${copyFromSchedule}" not found`
                    };
                }
                selectedCourses = [...sourceSchedule.selectedCourses];
            } else if (includeCurrentCourses) {
                // Include current course selections
                selectedCourses = this.profileStateManager.getSelectedCourses();
            }

            // Create the schedule
            const schedule = this.profileStateManager.createSchedule(name, 'api');

            // Update with selected courses if needed
            if (selectedCourses.length > 0) {
                const updateResult = await this.updateScheduleCourses(schedule.id, selectedCourses);
                if (!updateResult.success) {
                    return {
                        success: false,
                        error: `Schedule created but failed to add courses: ${updateResult.error}`
                    };
                }
            }

            // Activate if requested
            if (autoActivate) {
                const activateResult = await this.setActiveSchedule(schedule.id);
                if (!activateResult.success) {
                    console.warn('Schedule created but failed to activate:', activateResult.error);
                }
            }

            // Auto-save if requested
            if (autoSave) {
                this.profileStateManager.save();
            }

            // Notify listeners
            this.notifyScheduleListeners({
                type: 'schedule_created',
                schedule,
                timestamp: Date.now()
            });

            return {
                success: true,
                schedule
            };

        } catch (error) {
            console.error('Error creating schedule:', error);
            return {
                success: false,
                error: `Error creating schedule: ${error}`
            };
        }
    }

    async createScheduleFromCurrent(name: string): Promise<ScheduleOperationResult> {
        return this.createNewSchedule(name, {
            includeCurrentCourses: true,
            autoActivate: false,
            autoSave: true
        });
    }

    async saveCurrentAsSchedule(name: string): Promise<ScheduleOperationResult> {
        return this.createScheduleFromCurrent(name);
    }

    // Schedule loading and activation
    async setActiveSchedule(scheduleId: string): Promise<ScheduleOperationResult> {
        await this.ensureInitialized();

        try {
            const schedules = this.profileStateManager.getAllSchedules();
            const schedule = schedules.find(s => s.id === scheduleId);

            if (!schedule) {
                return {
                    success: false,
                    error: `Schedule with ID "${scheduleId}" not found`
                };
            }

            // Validate schedule before activation
            const validation = this.dataValidator.validateSchedule(schedule);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Schedule validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
                    warnings: validation.warnings.map(w => w.message)
                };
            }

            // Activate
            this.profileStateManager.setActiveSchedule(scheduleId, 'api');

            // Notify listeners
            this.notifyScheduleListeners({
                type: 'schedule_activated',
                schedule,
                timestamp: Date.now()
            });

            return {
                success: true,
                schedule
            };

        } catch (error) {
            console.error('Error setting active schedule:', error);
            return {
                success: false,
                error: `Error setting active schedule: ${error}`
            };
        }
    }

    // Schedule updates
    async updateSchedule(scheduleId: string, updates: Partial<Schedule>, options: ScheduleUpdateOptions = {}): Promise<ScheduleOperationResult> {
        await this.ensureInitialized();
        const { autoSave = true } = options;

        try {
            const schedules = this.profileStateManager.getAllSchedules();
            const existingSchedule = schedules.find(s => s.id === scheduleId);

            if (!existingSchedule) {
                return {
                    success: false,
                    error: `Schedule with ID "${scheduleId}" not found`
                };
            }

            // Validate updates
            const updatedSchedule = { ...existingSchedule, ...updates };
            const validation = this.dataValidator.validateSchedule(updatedSchedule);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Schedule update validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
                    warnings: validation.warnings.map(w => w.message)
                };
            }

            // Update
            this.profileStateManager.updateSchedule(scheduleId, updates, 'api');

            // Auto-save if requested
            if (autoSave) {
                this.profileStateManager.save();
            }

            // Get updated schedule
            const finalSchedule = this.profileStateManager.getAllSchedules().find(s => s.id === scheduleId);

            // Notify listeners
            this.notifyScheduleListeners({
                type: 'schedule_updated',
                schedule: finalSchedule,
                timestamp: Date.now()
            });

            return {
                success: true,
                schedule: finalSchedule
            };

        } catch (error) {
            console.error('Error updating schedule:', error);
            return {
                success: false,
                error: `Error updating schedule: ${error}`
            };
        }
    }

    async renameSchedule(scheduleId: string, newName: string): Promise<ScheduleOperationResult> {
        if (!newName || newName.trim().length === 0) {
            return {
                success: false,
                error: 'Schedule name cannot be empty'
            };
        }

        // Check for duplicate names
        const existingSchedules = this.profileStateManager.getAllSchedules();
        if (existingSchedules.some(s => s.name === newName && s.id !== scheduleId)) {
            return {
                success: false,
                error: `A schedule with the name "${newName}" already exists`
            };
        }

        return this.updateSchedule(scheduleId, { name: newName });
    }

    async duplicateSchedule(scheduleId: string, newName: string): Promise<ScheduleOperationResult> {
        await this.ensureInitialized();

        try {
            if (!newName || newName.trim().length === 0) {
                return {
                    success: false,
                    error: 'Schedule name cannot be empty'
                };
            }

            const duplicatedSchedule = this.profileStateManager.duplicateSchedule(scheduleId, newName, 'api');

            if (!duplicatedSchedule) {
                return {
                    success: false,
                    error: `Schedule with ID "${scheduleId}" not found`
                };
            }

            this.profileStateManager.save();

            // Notify listeners
            this.notifyScheduleListeners({
                type: 'schedule_created',
                schedule: duplicatedSchedule,
                timestamp: Date.now()
            });

            return {
                success: true,
                schedule: duplicatedSchedule
            };

        } catch (error) {
            console.error('Error duplicating schedule:', error);
            return {
                success: false,
                error: `Error duplicating schedule: ${error}`
            };
        }
    }

    // Schedule deletion
    async deleteSchedule(scheduleId: string, options: { force?: boolean } = {}): Promise<{ success: boolean; error?: string }> {
        await this.ensureInitialized();
        const { force = false } = options;

        try {
            const schedules = this.profileStateManager.getAllSchedules();
            const scheduleToDelete = schedules.find(s => s.id === scheduleId);

            if (!scheduleToDelete) {
                return {
                    success: false,
                    error: `Schedule with ID "${scheduleId}" not found`
                };
            }

            // Prevent deletion of last schedule unless forced
            if (schedules.length <= 1 && !force) {
                return {
                    success: false,
                    error: 'Cannot delete the last schedule. At least one schedule must exist.'
                };
            }

            this.profileStateManager.deleteSchedule(scheduleId, 'api');

            this.profileStateManager.save();

            // Notify listeners
            this.notifyScheduleListeners({
                type: 'schedule_deleted',
                schedule: scheduleToDelete,
                timestamp: Date.now()
            });

            return { success: true };

        } catch (error) {
            console.error('Error deleting schedule:', error);
            return {
                success: false,
                error: `Error deleting schedule: ${error}`
            };
        }
    }

    // Schedule queries
    getActiveSchedule(): Schedule | null {
        if (!this.isInitialized) return null;
        return this.profileStateManager.getActiveSchedule();
    }

    getActiveScheduleId(): string | null {
        const activeSchedule = this.getActiveSchedule();
        return activeSchedule?.id || null;
    }

    getAllSchedules(): Schedule[] {
        if (!this.isInitialized) return [];
        return this.profileStateManager.getAllSchedules();
    }

    getScheduleById(scheduleId: string): Schedule | null {
        const schedules = this.getAllSchedules();
        return schedules.find(s => s.id === scheduleId) || null;
    }

    // Legacy compatibility methods
    loadSchedule(scheduleId: string): Schedule | null {
        return this.getScheduleById(scheduleId);
    }

    async manualSaveCurrentProfile(): Promise<{ success: boolean; error?: string }> {
        return this.save();
    }

    // Course management within schedules
    private async updateScheduleCourses(scheduleId: string, selectedCourses: SelectedCourse[]): Promise<{ success: boolean; error?: string }> {
        try {
            // Validate all courses first
            const validation = this.dataValidator.validateBatch(
                selectedCourses,
                (course) => this.dataValidator.validateSelectedCourse(course)
            );

            if (!validation.valid) {
                return {
                    success: false,
                    error: `Course validation failed: ${validation.errors.map(e => e.message).join(', ')}`
                };
            }

            const updateResult = await this.updateSchedule(scheduleId, {
                selectedCourses: [...selectedCourses]
            });

            return {
                success: updateResult.success,
                error: updateResult.error
            };

        } catch (error) {
            return {
                success: false,
                error: `Failed to update schedule courses: ${error}`
            };
        }
    }

    async syncActiveScheduleWithCurrentSelections(): Promise<{ success: boolean; error?: string }> {
        await this.ensureInitialized();

        try {
            const activeScheduleId = this.getActiveScheduleId();
            if (!activeScheduleId) {
                return {
                    success: false,
                    error: 'No active schedule to sync'
                };
            }

            const currentSelections = this.profileStateManager.getSelectedCourses();
            return this.updateScheduleCourses(activeScheduleId, currentSelections);

        } catch (error) {
            return {
                success: false,
                error: `Failed to sync schedule: ${error}`
            };
        }
    }

    // Save and persistence
    async save(): Promise<{ success: boolean; error?: string }> {
        try {
            await this.ensureInitialized();
            this.profileStateManager.save();
            return {
                success: true
            };
        } catch (error) {
            return {
                success: false,
                error: `Save failed: ${error}`
            };
        }
    }

    hasUnsavedChanges(): boolean {
        if (!this.isInitialized) return false;
        return this.profileStateManager.hasUnsavedChanges();
    }

    // Export/Import
    async exportSchedule(scheduleId: string): Promise<{ success: boolean; data?: string; error?: string }> {
        try {
            const data = await this.profileStateManager.exportData();
            if (!data) {
                return {
                    success: false,
                    error: 'Export failed'
                };
            }

            const parsed = JSON.parse(data);
            const scheduleIndex = this.profileStateManager.getAllSchedules()
                .findIndex(s => s.id === scheduleId);

            if (scheduleIndex === -1) {
                return {
                    success: false,
                    error: `Schedule with ID "${scheduleId}" not found`
                };
            }

            const singleScheduleExport = {
                v: parsed.v,
                a: 0,
                s: [parsed.s[scheduleIndex]],
                p: parsed.p
            };

            return {
                success: true,
                data: JSON.stringify(singleScheduleExport)
            };
        } catch (error) {
            return {
                success: false,
                error: `Export failed: ${error}`
            };
        }
    }

    async exportAllSchedules(): Promise<{ success: boolean; data?: string; error?: string }> {
        try {
            const data = await this.profileStateManager.exportData();
            if (!data) {
                return {
                    success: false,
                    error: 'Export failed'
                };
            }
            return {
                success: true,
                data
            };
        } catch (error) {
            return {
                success: false,
                error: `Export all failed: ${error}`
            };
        }
    }

    async exportScheduleICS(scheduleId: string, options: ICSExportOptions = {}): Promise<ICSExportResult & { error?: string }> {
        try {
            const schedule = this.getScheduleById(scheduleId);
            if (!schedule) {
                return {
                    success: false,
                    skippedCourses: 0,
                    totalCourses: 0,
                    error: `Schedule with ID "${scheduleId}" not found`
                };
            }

            const result = ICSGenerator.generateICS(schedule, options);

            if (!result.success) {
                return result;
            }

            return result;
        } catch (error) {
            return {
                success: false,
                skippedCourses: 0,
                totalCourses: 0,
                error: `ICS export failed: ${error}`
            };
        }
    }

    async importSchedule(jsonData: string): Promise<ScheduleOperationResult> {
        try {
            await this.ensureInitialized();

            const data = JSON.parse(jsonData);

            if (data.v !== "4") {
                return {
                    success: false,
                    error: 'Unsupported import format. Please export your schedules again using the latest version.'
                };
            }

            const result = await this.profileStateManager.importData(jsonData);
            if (!result.success) {
                return {
                    success: false,
                    error: result.error?.message || 'Import failed'
                };
            }
            return { success: true };

        } catch (error) {
            return {
                success: false,
                error: `Import failed: ${error}`
            };
        }
    }

    // Event handling
    addScheduleListener(listener: ScheduleChangeListener): void {
        this.scheduleListeners.add(listener);
    }

    removeScheduleListener(listener: ScheduleChangeListener): void {
        this.scheduleListeners.delete(listener);
    }

    removeAllScheduleListeners(): void {
        this.scheduleListeners.clear();
    }

    // Convenience method for backward compatibility
    onActiveScheduleChange(callback: (activeSchedule: Schedule | null, event?: ScheduleChangeEvent) => void): void {
        const listener: ScheduleChangeListener = (event) => {
            if (event.type === 'schedule_activated') {
                callback(event.schedule || null, event);
            }
        };
        this.addScheduleListener(listener);
    }

    // Convenience method for save state changes
    onSaveStateChange(callback: (hasUnsavedChanges: boolean) => void): void {
        const stateListener = (event: StateChangeEvent) => {
            if (event.type === 'save_state_changed') {
                callback(event.data.hasUnsavedChanges);
            }
        };
        this.profileStateManager.addListener(stateListener);
    }

    // Access to course selection service
    getCourseSelectionService(): CourseSelectionService {
        return this.courseSelectionService;
    }

    // Health check
    async performHealthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
        const issues: string[] = [];

        try {
            if (!this.isInitialized) {
                issues.push('Service not initialized');
            }

            // Check all schedules
            const schedules = this.getAllSchedules();
            const validation = this.dataValidator.validateBatch(
                schedules,
                (schedule) => this.dataValidator.validateSchedule(schedule)
            );

            if (!validation.valid) {
                issues.push(`Schedule validation: ${validation.errors.length} errors found`);
            }

            // Check active schedule consistency
            const activeScheduleId = this.getActiveScheduleId();
            if (activeScheduleId && !schedules.some(s => s.id === activeScheduleId)) {
                issues.push('Active schedule ID references non-existent schedule');
            }

        } catch (error) {
            issues.push(`Health check error: ${error}`);
        }

        return {
            healthy: issues.length === 0,
            issues
        };
    }

    // Private helper methods
    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    private setupStateManagerListeners(): void {
        const stateListener: StateChangeListener = (event: StateChangeEvent) => {
            // Convert state events to schedule events as needed
            switch (event.type) {
                case 'schedule_changed':
                    if (event.data.action === 'created') {
                        this.notifyScheduleListeners({
                            type: 'schedule_created',
                            schedule: event.data.schedule,
                            timestamp: event.timestamp
                        });
                    } else if (event.data.action === 'deleted') {
                        this.notifyScheduleListeners({
                            type: 'schedule_deleted',
                            schedule: event.data.schedule,
                            timestamp: event.timestamp
                        });
                    } else if (event.data.action === 'updated') {
                        this.notifyScheduleListeners({
                            type: 'schedule_updated',
                            schedule: event.data.schedule,
                            timestamp: event.timestamp
                        });
                    }
                    break;
                case 'active_schedule_changed':
                    this.notifyScheduleListeners({
                        type: 'schedule_activated',
                        schedule: event.data.schedule,
                        timestamp: event.timestamp,
                        source: event.source
                    });
                    break;
            }
        };

        this.profileStateManager.addListener(stateListener);
    }

    private notifyScheduleListeners(event: ScheduleChangeEvent): void {
        this.scheduleListeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                console.error('Error in schedule change listener:', error);
            }
        });
    }

    async initializeDefaultScheduleIfNeeded(): Promise<void> {
        const existingSchedules = this.profileStateManager.getAllSchedules();
        
        if (existingSchedules.length === 0) {
            // Use ProfileStateManager directly to avoid circular dependency
            const defaultSchedule = this.profileStateManager.createSchedule('My Schedule', 'system');
            
            // Set as active
            this.profileStateManager.setActiveSchedule(defaultSchedule.id, 'system');
            
            this.profileStateManager.save();
        } else if (!this.getActiveScheduleId()) {
            // Activate last schedule if no active one
            this.profileStateManager.setActiveSchedule(existingSchedules[existingSchedules.length - 1].id, 'system');
        }
    }

    private generateUniqueScheduleName(baseName: string): string {
        const existingSchedules = this.getAllSchedules();
        const existingNames = new Set(existingSchedules.map(s => s.name));
        
        // If name doesn't conflict, use it as-is
        if (!existingNames.has(baseName)) {
            return baseName;
        }
        
        // Try appending numbers until we find a unique name
        let counter = 1;
        let candidateName: string;
        
        do {
            candidateName = `${baseName} (${counter})`;
            counter++;
        } while (existingNames.has(candidateName));
        
        return candidateName;
    }

    // Debug methods
    debugState(): void {
        console.log('=== SCHEDULE MANAGEMENT SERVICE DEBUG ===');
        console.log('Initialized:', this.isInitialized);
        console.log('Active Schedule ID:', this.getActiveScheduleId());
        console.log('Total Schedules:', this.getAllSchedules().length);
        console.log('Listeners:', this.scheduleListeners.size);
        console.log('Has Unsaved Changes:', this.hasUnsavedChanges());
        
        this.profileStateManager.debugState();
        
        console.log('Health Check:', this.performHealthCheck());
        console.log('===============================================');
    }

    async getStorageStats() {
        return this.profileStateManager.getStorageStats();
    }

    async clearAllSchedules(): Promise<void> {
        await this.profileStateManager.clearAllData();
    }
}