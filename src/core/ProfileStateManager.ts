import { Schedule, UserScheduleState, SchedulePreferences, SelectedCourse } from '../types/schedule'
import { Course, Section } from '../types/types'
import { TransactionalStorageManager, TransactionResult } from './TransactionalStorageManager'

export interface StateChangeEvent {
    type: 'schedule_changed' | 'courses_changed' | 'preferences_changed' | 'active_schedule_changed' | 'save_state_changed';
    data: any;
    timestamp: number;
    source: string;
}

export interface ProfileState {
    activeScheduleId: string | null;
    schedules: Schedule[];
    selectedCourses: SelectedCourse[];
    preferences: SchedulePreferences;
    isLoading: boolean;
    lastSaved: number;
    hasUnsavedChanges: boolean;
}

export type StateChangeListener = (event: StateChangeEvent, state: ProfileState) => void;

export class ProfileStateManager {
    private state: ProfileState;
    private listeners = new Set<StateChangeListener>();
    private storageManager: TransactionalStorageManager;
    private saveDebounceTimer: NodeJS.Timeout | null = null;
    private readonly DEBOUNCE_DELAY = 500; // 500ms debounce
    private isLoadingFlag = false;
    private eventQueue: StateChangeEvent[] = [];
    private processingQueue = false;

    constructor(storageManager?: TransactionalStorageManager) {
        this.storageManager = storageManager || new TransactionalStorageManager();
        this.state = this.createInitialState();
        this.initializeFromStorage();
    }

    // Public API for state access
    getState(): Readonly<ProfileState> {
        return { ...this.state };
    }

    getActiveSchedule(): Schedule | null {
        if (!this.state.activeScheduleId) return null;
        return this.state.schedules.find(s => s.id === this.state.activeScheduleId) || null;
    }

    getAllSchedules(): Schedule[] {
        return [...this.state.schedules];
    }

    getSelectedCourses(): SelectedCourse[] {
        return [...this.state.selectedCourses];
    }

    getSelectedCourse(course: Course): SelectedCourse | undefined {
        return this.state.selectedCourses.find(sc => sc.course.id === course.id);
    }

    getPreferences(): SchedulePreferences {
        return { ...this.state.preferences };
    }

    hasUnsavedChanges(): boolean {
        return this.state.hasUnsavedChanges;
    }

    isLoading(): boolean {
        return this.state.isLoading || this.isLoadingFlag;
    }

    // Course selection methods
    selectCourse(course: Course, isRequired: boolean = false, source: string = 'user'): void {
        this.withStateUpdate(() => {
            const existingIndex = this.state.selectedCourses.findIndex(sc => sc.course.id === course.id);
            
            if (existingIndex >= 0) {
                // Update existing selection
                this.state.selectedCourses[existingIndex] = {
                    ...this.state.selectedCourses[existingIndex],
                    isRequired
                };
            } else {
                // Add new selection
                const selectedCourse: SelectedCourse = {
                    course,
                    selectedSection: null,
                    selectedSectionNumber: null,
                    isRequired
                };
                this.state.selectedCourses.push(selectedCourse);
            }

            this.updateActiveScheduleWithCurrentCourses();
            this.emitEvent('courses_changed', { course, action: 'selected', isRequired }, source);
        });
    }

    unselectCourse(course: Course, source: string = 'user'): void {
        this.withStateUpdate(() => {
            const index = this.state.selectedCourses.findIndex(sc => sc.course.id === course.id);
            if (index >= 0) {
                this.state.selectedCourses.splice(index, 1);
                this.updateActiveScheduleWithCurrentCourses();
                this.emitEvent('courses_changed', { course, action: 'unselected' }, source);
            }
        });
    }

    setSelectedSection(course: Course, sectionNumber: string | null, source: string = 'user'): void {
        this.withStateUpdate(() => {
            const selectedCourse = this.state.selectedCourses.find(sc => sc.course.id === course.id);
            if (selectedCourse) {
                const sectionObject = sectionNumber ? 
                    course.sections.find(s => s.number === sectionNumber) || null : 
                    null;

                selectedCourse.selectedSection = sectionObject;
                selectedCourse.selectedSectionNumber = sectionNumber;

                this.updateActiveScheduleWithCurrentCourses();
                this.emitEvent('courses_changed', { course, sectionNumber, action: 'section_changed' }, source);
            }
        });
    }

    clearAllSelections(source: string = 'user'): void {
        this.withStateUpdate(() => {
            this.state.selectedCourses = [];
            this.updateActiveScheduleWithCurrentCourses();
            this.emitEvent('courses_changed', { action: 'cleared' }, source);
        });
    }

    // Schedule management methods
    createSchedule(name: string, source: string = 'user'): Schedule {
        return this.withStateUpdateSync(() => {
            const schedule: Schedule = {
                id: this.generateScheduleId(),
                name,
                selectedCourses: [...this.state.selectedCourses],
                generatedSchedules: []
            };

            this.state.schedules.push(schedule);
            this.emitEvent('schedule_changed', { schedule, action: 'created' }, source);
            return schedule;
        });
    }

    saveCurrentAsSchedule(name: string, source: string = 'user'): Schedule {
        return this.createSchedule(name, source);
    }

    setActiveSchedule(scheduleId: string, source: string = 'user'): boolean {
        return this.withStateUpdateSync(() => {
            const schedule = this.state.schedules.find(s => s.id === scheduleId);
            if (!schedule) return false;

            this.isLoadingFlag = true;
            this.state.activeScheduleId = scheduleId;

            // Load schedule's courses
            this.state.selectedCourses = [...schedule.selectedCourses];

            this.emitEvent('active_schedule_changed', { schedule }, source);
            this.emitEvent('courses_changed', { action: 'loaded_from_schedule', schedule }, source);

            // Save active schedule ID
            this.debouncedSave();
            this.isLoadingFlag = false;
            return true;
        });
    }

    updateSchedule(scheduleId: string, updates: Partial<Schedule>, source: string = 'user'): boolean {
        return this.withStateUpdateSync(() => {
            const index = this.state.schedules.findIndex(s => s.id === scheduleId);
            if (index < 0) return false;

            this.state.schedules[index] = { ...this.state.schedules[index], ...updates };
            
            // If this is the active schedule, emit active schedule changed event
            if (scheduleId === this.state.activeScheduleId) {
                this.emitEvent('active_schedule_changed', { schedule: this.state.schedules[index] }, source);
            }
            
            this.emitEvent('schedule_changed', { schedule: this.state.schedules[index], action: 'updated' }, source);
            return true;
        });
    }

    deleteSchedule(scheduleId: string, source: string = 'user'): boolean {
        return this.withStateUpdateSync(() => {
            const scheduleIndex = this.state.schedules.findIndex(s => s.id === scheduleId);
            if (scheduleIndex < 0) return false;

            // Don't allow deleting if it's the only schedule
            if (this.state.schedules.length <= 1) return false;

            const deletedSchedule = this.state.schedules[scheduleIndex];
            this.state.schedules.splice(scheduleIndex, 1);

            // If we deleted the active schedule, switch to another one
            if (this.state.activeScheduleId === scheduleId) {
                const nextSchedule = this.state.schedules[0];
                this.state.activeScheduleId = nextSchedule.id;
                this.state.selectedCourses = [...nextSchedule.selectedCourses];
                this.emitEvent('active_schedule_changed', { schedule: nextSchedule }, source);
            }

            this.emitEvent('schedule_changed', { schedule: deletedSchedule, action: 'deleted' }, source);
            return true;
        });
    }

    renameSchedule(scheduleId: string, newName: string, source: string = 'user'): boolean {
        return this.updateSchedule(scheduleId, { name: newName }, source);
    }

    duplicateSchedule(scheduleId: string, newName: string, source: string = 'user'): Schedule | null {
        const originalSchedule = this.state.schedules.find(s => s.id === scheduleId);
        if (!originalSchedule) return null;

        return this.withStateUpdateSync(() => {
            const duplicatedSchedule: Schedule = {
                id: this.generateScheduleId(),
                name: newName,
                selectedCourses: [...originalSchedule.selectedCourses],
                generatedSchedules: [...originalSchedule.generatedSchedules]
            };

            this.state.schedules.push(duplicatedSchedule);
            this.emitEvent('schedule_changed', { schedule: duplicatedSchedule, action: 'duplicated' }, source);
            return duplicatedSchedule;
        });
    }

    // Preferences management
    updatePreferences(updates: Partial<SchedulePreferences>, source: string = 'user'): void {
        this.withStateUpdate(() => {
            this.state.preferences = { ...this.state.preferences, ...updates };
            this.emitEvent('preferences_changed', { preferences: this.state.preferences }, source);
        });
    }

    // Event handling
    addListener(listener: StateChangeListener): void {
        this.listeners.add(listener);
    }

    removeListener(listener: StateChangeListener): void {
        this.listeners.delete(listener);
    }

    removeAllListeners(): void {
        this.listeners.clear();
    }

    // Persistence methods
    async save(): Promise<TransactionResult> {
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
            this.saveDebounceTimer = null;
        }

        const operations = [
            () => {
                // Save active schedule ID
                this.storageManager.saveActiveScheduleId(this.state.activeScheduleId);
            },
            () => {
                // Save all schedules
                this.state.schedules.forEach(schedule => {
                    this.storageManager.saveSchedule(schedule);
                });
            },
            () => {
                // Save selected courses
                this.storageManager.saveSelectedCourses(this.state.selectedCourses);
            },
            () => {
                // Save preferences
                this.storageManager.savePreferences(this.state.preferences);
            }
        ];

        const result = await this.storageManager.executeTransaction(operations);
        
        if (result.success) {
            const previousUnsavedState = this.state.hasUnsavedChanges;
            this.state.hasUnsavedChanges = false;
            this.state.lastSaved = Date.now();
            
            // Emit save state change event if state actually changed
            if (previousUnsavedState) {
                this.emitEvent('save_state_changed', { hasUnsavedChanges: false }, 'system');
            }
        }

        return result;
    }

    async loadFromStorage(): Promise<boolean> {
        try {
            this.state.isLoading = true;
            this.isLoadingFlag = true;

            // Load preferences first
            const preferencesResult = this.storageManager.loadPreferences();
            if (preferencesResult.valid && preferencesResult.data) {
                this.state.preferences = preferencesResult.data;
            }

            // Load all schedules
            const schedulesResult = this.storageManager.loadAllSchedules();
            if (schedulesResult.valid && schedulesResult.data) {
                this.state.schedules = schedulesResult.data;
            }

            // Load active schedule ID
            const activeIdResult = this.storageManager.loadActiveScheduleId();
            if (activeIdResult.valid && activeIdResult.data) {
                this.state.activeScheduleId = activeIdResult.data;
            }

            // Load selected courses for active schedule or standalone
            let loadedCourses: SelectedCourse[] = [];
            if (this.state.activeScheduleId) {
                const activeSchedule = this.state.schedules.find(s => s.id === this.state.activeScheduleId);
                if (activeSchedule) {
                    loadedCourses = activeSchedule.selectedCourses;
                }
            }

            // Fall back to standalone selected courses if no active schedule
            if (loadedCourses.length === 0) {
                const coursesResult = this.storageManager.loadSelectedCourses();
                if (coursesResult.valid && coursesResult.data) {
                    loadedCourses = coursesResult.data;
                }
            }

            this.state.selectedCourses = loadedCourses;

            // If no schedules exist, create a default one
            if (this.state.schedules.length === 0) {
                const defaultSchedule = this.createSchedule('My Schedule', 'system');
                this.state.activeScheduleId = defaultSchedule.id;
            }

            // If no active schedule but schedules exist, set the first one as active
            if (!this.state.activeScheduleId && this.state.schedules.length > 0) {
                this.state.activeScheduleId = this.state.schedules[0].id;
            }

            this.state.hasUnsavedChanges = false;
            this.state.lastSaved = Date.now();
            return true;

        } catch (error) {
            console.error('Failed to load from storage:', error);
            return false;
        } finally {
            this.state.isLoading = false;
            this.isLoadingFlag = false;
        }
    }

    // Export/Import functionality
    exportData(): string | null {
        const exportResult = this.storageManager.exportData();
        return exportResult.valid ? exportResult.data : null;
    }

    async importData(jsonData: string): Promise<TransactionResult> {
        const result = this.storageManager.importData(jsonData);
        if (result.success) {
            // Reload state from storage after successful import
            await this.loadFromStorage();
            this.emitEvent('schedule_changed', { action: 'imported' }, 'system');
        }
        return result;
    }

    // Health check
    isHealthy(): { healthy: boolean; issues: string[] } {
        const storageHealth = this.storageManager.isHealthy();
        const issues = [...storageHealth.issues];

        // Check state consistency
        if (this.state.activeScheduleId && !this.state.schedules.find(s => s.id === this.state.activeScheduleId)) {
            issues.push('Active schedule ID references non-existent schedule');
        }

        return {
            healthy: issues.length === 0,
            issues
        };
    }

    // Private helper methods
    private createInitialState(): ProfileState {
        return {
            activeScheduleId: null,
            schedules: [],
            selectedCourses: [],
            preferences: {
                preferredTimeRange: {
                    startTime: { hours: 8, minutes: 0 },
                    endTime: { hours: 18, minutes: 0 }
                },
                preferredDays: new Set(['mon', 'tue', 'wed', 'thu', 'fri']),
                avoidBackToBackClasses: false,
                theme: 'wpi-classic'
            },
            isLoading: false,
            lastSaved: 0,
            hasUnsavedChanges: false
        };
    }

    private async initializeFromStorage(): Promise<void> {
        await this.loadFromStorage();
    }

    private withStateUpdate<T>(updateFn: () => T): T {
        const previousUnsavedState = this.state.hasUnsavedChanges;
        const result = updateFn();
        this.state.hasUnsavedChanges = true;
        
        // Emit save state change event if state actually changed
        if (!previousUnsavedState) {
            this.emitEvent('save_state_changed', { hasUnsavedChanges: true }, 'system');
        }
        
        this.debouncedSave();
        return result;
    }

    private withStateUpdateSync<T>(updateFn: () => T): T {
        const previousUnsavedState = this.state.hasUnsavedChanges;
        const result = updateFn();
        this.state.hasUnsavedChanges = true;
        
        // Emit save state change event if state actually changed
        if (!previousUnsavedState) {
            this.emitEvent('save_state_changed', { hasUnsavedChanges: true }, 'system');
        }
        
        this.debouncedSave();
        return result;
    }

    private updateActiveScheduleWithCurrentCourses(): void {
        if (this.state.activeScheduleId) {
            const activeScheduleIndex = this.state.schedules.findIndex(s => s.id === this.state.activeScheduleId);
            if (activeScheduleIndex >= 0) {
                this.state.schedules[activeScheduleIndex].selectedCourses = [...this.state.selectedCourses];
            }
        }
    }

    private debouncedSave(): void {
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
        }

        this.saveDebounceTimer = setTimeout(async () => {
            if (!this.isLoadingFlag) {
                await this.save();
            }
        }, this.DEBOUNCE_DELAY);
    }

    private emitEvent(type: StateChangeEvent['type'], data: any, source: string): void {
        const event: StateChangeEvent = {
            type,
            data,
            timestamp: Date.now(),
            source
        };

        this.eventQueue.push(event);
        this.processEventQueue();
    }

    private processEventQueue(): void {
        if (this.processingQueue) return;
        this.processingQueue = true;

        // Process events in next tick to avoid recursion
        setTimeout(() => {
            const eventsToProcess = [...this.eventQueue];
            this.eventQueue = [];

            eventsToProcess.forEach(event => {
                this.listeners.forEach(listener => {
                    try {
                        listener(event, this.getState());
                    } catch (error) {
                        console.error('Error in state change listener:', error);
                    }
                });
            });

            this.processingQueue = false;

            // If more events were queued while processing, process them
            if (this.eventQueue.length > 0) {
                this.processEventQueue();
            }
        }, 0);
    }

    private generateScheduleId(): string {
        return `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Debug methods
    debugState(): void {
        console.log('=== PROFILE STATE DEBUG ===');
        console.log('Active Schedule ID:', this.state.activeScheduleId);
        console.log('Schedules:', this.state.schedules.map(s => ({
            id: s.id,
            name: s.name,
            courseCount: s.selectedCourses.length
        })));
        console.log('Selected Courses:', this.state.selectedCourses.length);
        console.log('Has Unsaved Changes:', this.state.hasUnsavedChanges);
        console.log('Last Saved:', new Date(this.state.lastSaved).toISOString());
        console.log('Listeners:', this.listeners.size);
        console.log('Health Check:', this.isHealthy());
        console.log('===============================');
    }
}