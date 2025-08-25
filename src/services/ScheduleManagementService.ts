import { Schedule, SelectedCourse, SchedulePreferences } from '../types/schedule'
import { ProfileStateManager, StateChangeEvent, StateChangeListener } from '../core/ProfileStateManager'
import { DataValidator, ValidationResult } from '../core/DataValidator'
import { RetryManager } from '../core/RetryManager'
import { CourseSelectionService } from './CourseSelectionService'

export interface ScheduleOperationResult {
    success: boolean;
    schedule?: Schedule;
    error?: string;
    warnings?: string[];
}

export interface ScheduleChangeEvent {
    type: 'schedule_created' | 'schedule_deleted' | 'schedule_updated' | 'schedule_activated' | 'schedules_loaded';
    schedule?: Schedule;
    schedules?: Schedule[];
    timestamp: number;
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

export class ScheduleManagementService {
    private profileStateManager: ProfileStateManager;
    private courseSelectionService: CourseSelectionService;
    private dataValidator: DataValidator;
    private retryManager: RetryManager;
    private scheduleListeners = new Set<ScheduleChangeListener>();
    private isInitialized = false;
    private initializationPromise: Promise<boolean> | null = null;

    constructor(
        profileStateManager?: ProfileStateManager,
        courseSelectionService?: CourseSelectionService,
        dataValidator?: DataValidator,
        retryManager?: RetryManager
    ) {
        this.profileStateManager = profileStateManager || new ProfileStateManager();
        this.courseSelectionService = courseSelectionService || new CourseSelectionService(this.profileStateManager);
        this.dataValidator = dataValidator || new DataValidator();
        this.retryManager = retryManager || RetryManager.createStorageRetryManager();

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

            // Create the schedule with retry using the unique name
            const result = await this.retryManager.executeWithRetry(
                () => {
                    return this.profileStateManager.createSchedule(name, 'api');
                },
                {
                    operationName: `create schedule "${name}"`,
                    onRetry: (attempt, error) => {
                        console.warn(`Schedule creation retry ${attempt}:`, error.message);
                    }
                }
            );

            if (!result.success || !result.result) {
                return {
                    success: false,
                    error: `Failed to create schedule: ${result.error?.message || 'Unknown error'}`
                };
            }

            const schedule = result.result;

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
                const saveResult = await this.profileStateManager.save();
                if (!saveResult.success) {
                    console.warn('Failed to auto-save after schedule creation:', saveResult.error);
                }
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

            // Activate with retry
            const result = await this.retryManager.executeWithRetry(
                () => {
                    return this.profileStateManager.setActiveSchedule(scheduleId, 'api');
                },
                {
                    operationName: `activate schedule "${schedule.name}"`,
                }
            );

            if (!result.success) {
                return {
                    success: false,
                    error: `Failed to activate schedule: ${result.error?.message || 'Unknown error'}`
                };
            }

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

            // Update with retry
            const result = await this.retryManager.executeWithRetry(
                () => {
                    return this.profileStateManager.updateSchedule(scheduleId, updates, 'api');
                },
                {
                    operationName: `update schedule "${existingSchedule.name}"`,
                }
            );

            if (!result.success) {
                return {
                    success: false,
                    error: `Failed to update schedule: ${result.error?.message || 'Unknown error'}`
                };
            }

            // Auto-save if requested
            if (autoSave) {
                const saveResult = await this.profileStateManager.save();
                if (!saveResult.success) {
                    console.warn('Failed to auto-save after schedule update:', saveResult.error);
                }
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

            const result = await this.retryManager.executeWithRetry(
                () => {
                    return this.profileStateManager.duplicateSchedule(scheduleId, newName, 'api');
                },
                {
                    operationName: `duplicate schedule to "${newName}"`,
                }
            );

            if (!result.success || !result.result) {
                return {
                    success: false,
                    error: `Failed to duplicate schedule: ${result.error?.message || 'Unknown error'}`
                };
            }

            const duplicatedSchedule = result.result;

            // Auto-save
            const saveResult = await this.profileStateManager.save();
            if (!saveResult.success) {
                console.warn('Failed to auto-save after schedule duplication:', saveResult.error);
            }

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

            const result = await this.retryManager.executeWithRetry(
                () => {
                    return this.profileStateManager.deleteSchedule(scheduleId, 'api');
                },
                {
                    operationName: `delete schedule "${scheduleToDelete.name}"`,
                }
            );

            if (!result.success) {
                return {
                    success: false,
                    error: `Failed to delete schedule: ${result.error?.message || 'Unknown error'}`
                };
            }

            // Auto-save
            const saveResult = await this.profileStateManager.save();
            if (!saveResult.success) {
                console.warn('Failed to auto-save after schedule deletion:', saveResult.error);
            }

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
            const result = await this.profileStateManager.save();
            return {
                success: result.success,
                error: result.error?.message
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
            const schedule = this.getScheduleById(scheduleId);
            if (!schedule) {
                return {
                    success: false,
                    error: `Schedule with ID "${scheduleId}" not found`
                };
            }

            const exportData = {
                version: '2.0',
                timestamp: new Date().toISOString(),
                schedule: schedule
            };

            return {
                success: true,
                data: JSON.stringify(exportData, null, 2)
            };
        } catch (error) {
            return {
                success: false,
                error: `Export failed: ${error}`
            };
        }
    }

    async importSchedule(jsonData: string): Promise<ScheduleOperationResult> {
        try {
            await this.ensureInitialized();

            const data = JSON.parse(jsonData);
            if (!data.schedule) {
                return {
                    success: false,
                    error: 'Import data does not contain a valid schedule'
                };
            }

            // Validate imported schedule
            const validation = this.dataValidator.validateSchedule(data.schedule);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Imported schedule validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
                    warnings: validation.warnings.map(w => w.message)
                };
            }

            // Resolve name conflicts automatically
            const uniqueName = this.generateUniqueScheduleName(data.schedule.name);

            // Create new schedule with imported data and unique name
            const importedSchedule: Schedule = {
                ...data.schedule,
                id: this.generateScheduleId(), // Generate new ID to avoid conflicts
                name: uniqueName
            };

            const result = await this.retryManager.executeWithRetry(
                () => {
                    // Manually add to state
                    const schedules = this.profileStateManager.getAllSchedules();
                    schedules.push(importedSchedule);
                    return importedSchedule;
                },
                {
                    operationName: `import schedule "${importedSchedule.name}"`,
                }
            );

            if (!result.success) {
                return {
                    success: false,
                    error: `Failed to import schedule: ${result.error?.message || 'Unknown error'}`
                };
            }

            // Auto-save
            const saveResult = await this.profileStateManager.save();
            if (!saveResult.success) {
                console.warn('Failed to auto-save after schedule import:', saveResult.error);
            }

            // Notify listeners
            this.notifyScheduleListeners({
                type: 'schedule_created',
                schedule: importedSchedule,
                timestamp: Date.now()
            });

            return {
                success: true,
                schedule: importedSchedule
            };

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
    onActiveScheduleChange(callback: (activeSchedule: Schedule | null) => void): void {
        const listener: ScheduleChangeListener = (event) => {
            if (event.type === 'schedule_activated') {
                callback(event.schedule || null);
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
                        timestamp: event.timestamp
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
            
            // Save the changes
            try {
                await this.profileStateManager.save();
            } catch (error) {
                console.warn('Failed to save default schedule:', error);
            }
        } else if (!this.getActiveScheduleId()) {
            // Activate first schedule if no active one
            this.profileStateManager.setActiveSchedule(existingSchedules[0].id, 'system');
        }
    }

    private generateScheduleId(): string {
        return `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
}