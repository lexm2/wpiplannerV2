import { Schedule, SchedulePreferences, SelectedCourse } from '../types/schedule'
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

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ProfileStateManager - Unified Application State & Persistence Foundation
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ARCHITECTURE ROLE:
 * - Single source of truth for all application data and state management
 * - Central coordination hub for course selections, schedules, and user preferences
 * - Foundation layer that eliminates data corruption through unified persistence
 * - Event-driven state management with real-time notifications across all components
 * - Core persistence coordinator integrating with transactional storage system
 * 
 * DEPENDENCIES:
 * - TransactionalStorageManager → Low-level storage operations with atomic transactions
 * - Schedule, SelectedCourse, SchedulePreferences types → Data models and contracts
 * - Course type → Core academic data structure for course selection operations
 * - StateChangeEvent system → Event-driven architecture for cross-component notifications
 * - localStorage (via TransactionalStorageManager) → Browser persistence layer
 * 
 * USED BY:
 * - CourseSelectionService → High-level course selection API with ProfileStateManager coordination
 * - ScheduleManagementService → Schedule operations and multi-schedule management
 * - MainController → Application initialization and core functionality coordination  
 * - ThemeManager → User preferences and theme persistence
 * - ALL UI Controllers → State access and event-driven updates
 * - ALL Services → Shared state access and persistence operations
 * 
 * UNIFIED STORAGE ARCHITECTURE:
 * Before (Multiple Storage Systems - Data Corruption Issues):
 * ```
 * CourseManager ←→ localStorage
 * StorageManager ←→ localStorage  
 * ThemeManager ←→ localStorage
 * [Competing writes, data corruption, inconsistent state]
 * ```
 * 
 * After (Unified Architecture - Single Source of Truth):
 * ```
 *                ProfileStateManager (Single Source of Truth)
 *                            ↓
 *                TransactionalStorageManager
 *                            ↓
 *                       localStorage
 *                            ↑
 *      ┌─────────────────────────────────────────────────────┐
 *      │                                                     │
 * ThemeManager    CourseSelectionService    MainController
 *      ↑
 * ThemeSelector
 * ```
 * 
 * DATA FLOW & STATE MANAGEMENT:
 * State Update Process:
 * 1. External component calls ProfileStateManager method (selectCourse, createSchedule, etc.)
 * 2. withStateUpdate() wrapper executes the state change atomically
 * 3. hasUnsavedChanges flag set to true, save state change event emitted
 * 4. Debounced save (500ms) triggers background persistence via TransactionalStorageManager
 * 5. StateChangeEvent emitted to all registered listeners with new state
 * 6. Event queue processes events asynchronously to prevent recursion
 * 7. UI components receive events and update accordingly
 * 
 * Persistence Flow:
 * 1. State changes trigger debouncedSave() to batch operations
 * 2. save() method creates transactional operations array
 * 3. TransactionalStorageManager.executeTransaction() ensures atomicity
 * 4. On success: hasUnsavedChanges = false, lastSaved timestamp updated
 * 5. save_state_changed event emitted for UI feedback
 * 
 * Loading Flow:
 * 1. initializeFromStorage() during constructor
 * 2. loadFromStorage() coordinates data loading from multiple storage keys
 * 3. Preferences, schedules, active schedule ID loaded in sequence
 * 4. Selected courses loaded from active schedule or fallback to standalone
 * 5. Default schedule created if none exist
 * 6. Loading flags cleared, state marked as clean (no unsaved changes)
 * 
 * KEY FEATURES:
 * - Atomic state updates with transactional persistence
 * - Event-driven architecture with cross-component notifications
 * - Debounced saves (500ms) to prevent excessive storage operations
 * - Multi-schedule support with active schedule management
 * - Course selection with section tracking and preferences
 * - Schedule preferences management (time ranges, preferred days, themes)
 * - Export/import functionality for data portability
 * - Health checking and consistency validation
 * - Comprehensive state access API with immutable getters
 * - Debug utilities for development and troubleshooting
 * 
 * STATE MANAGEMENT FEATURES:
 * Course Selection:
 * - selectCourse() / unselectCourse() with required/optional flagging
 * - setSelectedSection() for section-specific choices
 * - clearAllSelections() for bulk operations
 * - Automatic active schedule synchronization
 * 
 * Schedule Management:
 * - createSchedule() / saveCurrentAsSchedule() for schedule creation
 * - setActiveSchedule() for switching between saved schedules
 * - updateSchedule() / deleteSchedule() for schedule maintenance
 * - renameSchedule() / duplicateSchedule() for schedule management
 * - Automatic course loading when switching schedules
 * 
 * INTEGRATION POINTS:
 * - Foundation for unified storage system replacing competing storage systems
 * - Event hub for all application state changes and cross-component coordination
 * - Persistence coordinator ensuring data consistency across browser sessions
 * - State provider for all services requiring course selection or schedule data
 * - Bridge to TransactionalStorageManager for atomic storage operations
 * - Initialization target for MainController during application startup
 * 
 * ARCHITECTURAL PATTERNS:
 * - Singleton: Single instance shared across all application components
 * - Observer: Event-driven notifications to registered listeners
 * - Command: State update methods encapsulate business logic
 * - Repository: Centralized data access with consistent API
 * - Transaction: Atomic persistence operations via TransactionalStorageManager
 * - Facade: Simplified state management API hiding complex persistence logic
 * 
 * BENEFITS ACHIEVED:
 * - Eliminated data corruption from competing storage systems
 * - Single source of truth prevents inconsistent state
 * - Event-driven updates ensure UI consistency across components
 * - Debounced saves optimize performance and reduce storage overhead
 * - Transactional persistence prevents partial data corruption
 * - Comprehensive state management reduces component coupling
 * - Health checking enables proactive issue detection
 * - Export/import enables data portability and backup functionality
 * 
 * RECENT ARCHITECTURAL EVOLUTION:
 * - Replaced CourseManager + StorageManager dual system
 * - Integrated TransactionalStorageManager for atomic operations
 * - Added comprehensive event system for cross-component coordination
 * - Implemented debounced saving for performance optimization
 * - Added multi-schedule support with active schedule management
 * - Integrated health checking and consistency validation
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */
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
                let sectionObject: Section | null = null;
                
                if (sectionNumber) {
                    // Find the section in the course
                    sectionObject = course.sections.find(s => s.number === sectionNumber) || null;
                    
                    // Validate section object has required properties
                    if (sectionObject && !sectionObject.computedTerm) {
                        console.warn(`Section ${sectionNumber} for course ${course.department.abbreviation}${course.number} is missing computedTerm property`);
                        // Don't set the section if it's missing required data
                        sectionObject = null;
                    }
                    
                    if (!sectionObject && sectionNumber) {
                        console.warn(`Section ${sectionNumber} not found in course ${course.department.abbreviation}${course.number} sections:`, 
                            course.sections.map(s => s.number));
                    }
                }

                // Ensure we never set undefined - always use null
                selectedCourse.selectedSection = sectionObject;
                selectedCourse.selectedSectionNumber = sectionObject ? sectionNumber : null;

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


    setActiveSchedule(scheduleId: string, source: string = 'user'): boolean {
        return this.withStateUpdateSync(() => {
            const schedule = this.state.schedules.find(s => s.id === scheduleId);
            if (!schedule) return false;

            this.isLoadingFlag = true;
            this.state.activeScheduleId = scheduleId;

            // Load schedule's courses and sync section objects
            this.state.selectedCourses = [...schedule.selectedCourses];
            this.syncScheduleCoursesSectionObjects();

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

            // Remove from localStorage storage
            const deleteResult = this.storageManager.deleteSchedule(scheduleId);
            if (!deleteResult.success) {
                console.warn('Failed to delete schedule from storage:', deleteResult.error);
            }

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
                    console.log(`📂 ProfileStateManager: Loaded ${loadedCourses.length} courses from active schedule "${activeSchedule.name}"`);
                }
            }

            // Fall back to standalone selected courses if no active schedule
            if (loadedCourses.length === 0) {
                const coursesResult = this.storageManager.loadSelectedCourses();
                if (coursesResult.valid && coursesResult.data) {
                    loadedCourses = coursesResult.data;
                    console.log(`📂 ProfileStateManager: Loaded ${loadedCourses.length} standalone courses from storage`);
                } else {
                    console.log('📂 ProfileStateManager: No standalone courses found in storage');
                }
            }

            this.state.selectedCourses = loadedCourses;
            console.log(`📊 ProfileStateManager: Final loaded course count: ${loadedCourses.length}`);

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

    private syncScheduleCoursesSectionObjects(): void {
        this.state.selectedCourses.forEach(sc => {
            // If we have a selectedSectionNumber but no selectedSection object (or invalid object)
            if (sc.selectedSectionNumber && (!sc.selectedSection || !sc.selectedSection.computedTerm)) {
                // Find the section object in the course
                const sectionObject = sc.course.sections?.find(s => s.number === sc.selectedSectionNumber);
                
                if (sectionObject && sectionObject.computedTerm) {
                    sc.selectedSection = sectionObject;
                } else {
                    // Clear invalid section references
                    sc.selectedSection = null;
                    sc.selectedSectionNumber = null;
                }
            }
        });
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